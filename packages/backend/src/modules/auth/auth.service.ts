import type { User } from "@prisma/client";
import {
  AuthError,
  ErrorCode,
  GUEST_REFRESH_TOKEN_EXPIRY_DAYS,
  type LoginInput,
  REFRESH_TOKEN_EXPIRY_DAYS,
  type RegisterInput,
  type TokenPayload,
  ValidationError,
} from "@werewolf/shared";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { logger } from "../../common/utils/logger";
import { prisma } from "../../common/utils/prisma";
import { config } from "../../config";
import type { SafeUser } from "./auth.types";

export class AuthService {
  private readonly SALT_ROUNDS = 10;

  async register(data: RegisterInput): Promise<{
    user: SafeUser;
    accessToken: string;
    refreshToken: string;
  }> {
    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === data.email) {
        throw new ValidationError("Email already exists");
      }
      throw new ValidationError("Username already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, this.SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash,
        locale: data.locale || "en",
        isGuest: false,
      },
    });

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Create session
    await this.createSession(user.id, refreshToken, false);

    logger.info(`User registered: ${user.username}`);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async login(data: LoginInput): Promise<{
    user: SafeUser;
    accessToken: string;
    refreshToken: string;
  }> {
    // Find user
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.username }],
        isGuest: false,
      },
    });

    if (!user || !user.passwordHash) {
      throw new AuthError(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
    }

    // Check password
    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      throw new AuthError(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
    }

    // Clean up old sessions
    await this.cleanupOldSessions(user.id);

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Create session
    await this.createSession(user.id, refreshToken, false);

    logger.info(`User logged in: ${user.username}`);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async createGuest(locale: string): Promise<{
    user: SafeUser;
    accessToken: string;
    refreshToken: string;
  }> {
    // Generate unique username
    const username = await this.generateUniqueGuestUsername();

    // Create guest user
    const user = await prisma.user.create({
      data: {
        username,
        isGuest: true,
        locale,
      },
    });

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // Create session
    await this.createSession(user.id, refreshToken, true);

    logger.info(`Guest user created: ${user.username}`);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
  }> {
    // Verify refresh token
    let payload: TokenPayload;
    try {
      payload = jwt.verify(
        refreshToken,
        config.jwtRefreshSecret,
      ) as TokenPayload;
    } catch (error) {
      throw new AuthError(ErrorCode.TOKEN_EXPIRED, "Invalid refresh token");
    }

    // Check session
    const session = await prisma.session.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      throw new AuthError(ErrorCode.TOKEN_EXPIRED, "Session expired");
    }

    // Generate new access token
    const accessToken = this.generateAccessToken({
      userId: session.user.id,
      username: session.user.username,
      isGuest: session.user.isGuest,
    });

    return { accessToken };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await prisma.session.deleteMany({
        where: { token: refreshToken },
      });
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }

  async convertGuestToUser(
    userId: string,
    email: string,
    password: string,
  ): Promise<SafeUser> {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isGuest) {
      throw new ValidationError("Invalid user or not a guest account");
    }

    // Check if email exists
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      throw new ValidationError("Email already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        email,
        passwordHash,
        isGuest: false,
      },
    });

    logger.info(`Guest user converted: ${updatedUser.username}`);

    return this.sanitizeUser(updatedUser);
  }

  async getProfile(userId: string): Promise<SafeUser & { gameCount: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            playerProfiles: true,
          },
        },
      },
    });

    if (!user) {
      throw new AuthError(ErrorCode.UNAUTHORIZED, "User not found");
    }

    return {
      ...this.sanitizeUser(user),
      gameCount: user._count.playerProfiles,
    };
  }

  async updateProfile(userId: string, locale: string): Promise<SafeUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { locale },
    });

    return this.sanitizeUser(user);
  }

  // Helper methods
  private generateTokens(user: {
    id: string;
    username: string;
    isGuest: boolean;
  }) {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      isGuest: user.isGuest,
    };

    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  private generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtAccessExpiry as StringValue,
    });
  }

  private generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.jwtRefreshSecret, {
      expiresIn: config.jwtRefreshExpiry as StringValue,
    });
  }

  private async createSession(
    userId: string,
    refreshToken: string,
    isGuest: boolean,
  ): Promise<void> {
    const expiryDays = isGuest
      ? GUEST_REFRESH_TOKEN_EXPIRY_DAYS
      : REFRESH_TOKEN_EXPIRY_DAYS;

    await prisma.session.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  private async cleanupOldSessions(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: {
        userId,
        expiresAt: { lt: new Date() },
      },
    });
  }

  private async generateUniqueGuestUsername(): Promise<string> {
    const adjectives = ["Swift", "Clever", "Mystic", "Silent", "Brave"];
    const nouns = ["Wolf", "Villager", "Hunter", "Seer", "Guardian"];

    for (let attempt = 0; attempt < 10; attempt++) {
      const adjective =
        adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      const number = Math.floor(Math.random() * 9999);
      const username = `${adjective}${noun}${number}`;

      const existing = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });

      if (!existing) return username;
    }

    throw new ValidationError("Failed to generate unique guest username");
  }

  private sanitizeUser(user: User): SafeUser {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}

export const authService = new AuthService();
