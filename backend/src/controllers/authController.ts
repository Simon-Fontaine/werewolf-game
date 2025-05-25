import type { ApiResponse } from "@shared/types";
import type { Request, Response } from "express";
import type { User } from "../../generated/prisma";
import { prisma } from "../index";
import {
	comparePassword,
	generateAccessToken,
	generateGuestUsername,
	generateRefreshToken,
	hashPassword,
	verifyRefreshToken,
} from "../utils/auth";

// Constants
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const GUEST_REFRESH_TOKEN_EXPIRY_DAYS = 30;
const USERNAME_GENERATION_MAX_ATTEMPTS = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_USERNAME_LENGTH = 30;
const MAX_EMAIL_LENGTH = 100;

// Types
interface RegisterRequest {
	email: string;
	username: string;
	password: string;
	locale?: string;
}

interface LoginRequest {
	username: string;
	password: string;
}

interface CreateGuestRequest {
	locale?: string;
}

interface RefreshTokenRequest {
	refreshToken: string;
}

interface ConvertGuestRequest {
	email: string;
	password: string;
}

// Custom error classes
class AuthValidationError extends Error {
	code = "AUTH_VALIDATION_ERROR";
	constructor(message: string) {
		super(message);
		this.name = "AuthValidationError";
	}
}

class AuthenticationError extends Error {
	code = "AUTHENTICATION_ERROR";
	constructor(message: string) {
		super(message);
		this.name = "AuthenticationError";
	}
}

class UserConflictError extends Error {
	code = "USER_CONFLICT_ERROR";
	constructor(message: string) {
		super(message);
		this.name = "UserConflictError";
	}
}

class AuthController {
	/**
	 * Validates email format
	 */
	private validateEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email) && email.length <= MAX_EMAIL_LENGTH;
	}

	/**
	 * Validates username format
	 */
	private validateUsername(username: string): boolean {
		const usernameRegex = /^[a-zA-Z0-9_-]+$/;
		return (
			usernameRegex.test(username) &&
			username.length >= 3 &&
			username.length <= MAX_USERNAME_LENGTH
		);
	}

	/**
	 * Validates password strength
	 */
	private validatePassword(password: string): {
		valid: boolean;
		message?: string;
	} {
		if (password.length < MIN_PASSWORD_LENGTH) {
			return {
				valid: false,
				message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
			};
		}

		// Check for at least one number and one letter
		const hasNumber = /\d/.test(password);
		const hasLetter = /[a-zA-Z]/.test(password);

		if (!hasNumber || !hasLetter) {
			return {
				valid: false,
				message: "Password must contain at least one letter and one number",
			};
		}

		return { valid: true };
	}

	/**
	 * Validates locale
	 */
	private validateLocale(locale: string): boolean {
		const validLocales = ["en", "fr"];
		return validLocales.includes(locale);
	}

	/**
	 * Creates a new session for a user
	 */
	private async createSession(
		userId: string,
		refreshToken: string,
		isGuest = false,
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

	/**
	 * Generates unique username for guests
	 */
	private async generateUniqueGuestUsername(): Promise<string> {
		for (
			let attempt = 0;
			attempt < USERNAME_GENERATION_MAX_ATTEMPTS;
			attempt++
		) {
			const username = generateGuestUsername();
			const existing = await prisma.user.findUnique({
				where: { username },
				select: { id: true },
			});

			if (!existing) return username;
		}

		throw new AuthValidationError("Failed to generate unique guest username");
	}

	/**
	 * Formats user data for response
	 */
	private formatUserResponse(user: User) {
		return {
			id: user.id,
			username: user.username,
			email: user.email || undefined,
			isGuest: user.isGuest,
			locale: user.locale,
			createdAt: user.createdAt,
		};
	}

	/**
	 * Generates auth tokens for user
	 */
	private generateAuthTokens(user: User) {
		const tokenPayload = {
			userId: user.id,
			username: user.username,
			isGuest: user.isGuest,
		};

		return {
			accessToken: generateAccessToken(tokenPayload),
			refreshToken: generateRefreshToken(tokenPayload),
		};
	}

	/**
	 * Sends error response with appropriate status code
	 */
	private sendErrorResponse(res: Response, error: unknown): void {
		console.error("Auth controller error:", error);

		if (error instanceof AuthValidationError) {
			res.status(400).json({
				success: false,
				error: error.message,
				code: error.code,
			} as ApiResponse);
		} else if (error instanceof AuthenticationError) {
			res.status(401).json({
				success: false,
				error: error.message,
				code: error.code,
			} as ApiResponse);
		} else if (error instanceof UserConflictError) {
			res.status(409).json({
				success: false,
				error: error.message,
				code: error.code,
			} as ApiResponse);
		} else if (error instanceof Error) {
			res.status(500).json({
				success: false,
				error: "Internal server error",
				code: "INTERNAL_ERROR",
			} as ApiResponse);
		} else {
			res.status(500).json({
				success: false,
				error: "An unexpected error occurred",
				code: "UNKNOWN_ERROR",
			} as ApiResponse);
		}
	}

	/**
	 * User registration
	 */
	register = async (req: Request, res: Response): Promise<void> => {
		try {
			const {
				email,
				username,
				password,
				locale = "en",
			}: RegisterRequest = req.body;

			// Validate input
			if (!email || !username || !password) {
				throw new AuthValidationError(
					"Email, username, and password are required",
				);
			}

			// Validate email format
			if (!this.validateEmail(email)) {
				throw new AuthValidationError("Invalid email format");
			}

			// Validate username format
			if (!this.validateUsername(username)) {
				throw new AuthValidationError(
					"Username must be 3-30 characters long and contain only letters, numbers, hyphens, and underscores",
				);
			}

			// Validate password strength
			const passwordValidation = this.validatePassword(password);
			if (!passwordValidation.valid) {
				throw new AuthValidationError(
					passwordValidation.message || "Invalid password",
				);
			}

			// Validate locale
			if (!this.validateLocale(locale)) {
				throw new AuthValidationError("Invalid locale");
			}

			// Check if user already exists
			const existingUser = await prisma.user.findFirst({
				where: {
					OR: [{ email }, { username }],
				},
				select: { email: true, username: true },
			});

			if (existingUser) {
				if (existingUser.email === email) {
					throw new UserConflictError("Email already exists");
				}
				if (existingUser.username === username) {
					throw new UserConflictError("Username already exists");
				}
			}

			// Create user
			const hashedPassword = await hashPassword(password);
			const user = await prisma.user.create({
				data: {
					email,
					username,
					passwordHash: hashedPassword,
					locale,
					isGuest: false,
				},
			});

			// Generate tokens and create session
			const { accessToken, refreshToken } = this.generateAuthTokens(user);
			await this.createSession(user.id, refreshToken, false);

			res.status(201).json({
				success: true,
				data: {
					user: this.formatUserResponse(user),
					accessToken,
					refreshToken,
				},
				message: "User registered successfully",
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * User login
	 */
	login = async (req: Request, res: Response): Promise<void> => {
		try {
			const { username, password }: LoginRequest = req.body;

			if (!username || !password) {
				throw new AuthValidationError("Username and password are required");
			}

			// Find user by username or email
			const user = await prisma.user.findFirst({
				where: {
					OR: [{ username }, { email: username }],
					isGuest: false,
				},
			});

			if (!user || !user.passwordHash) {
				throw new AuthenticationError("Invalid credentials");
			}

			// Check password
			const isValid = await comparePassword(password, user.passwordHash);
			if (!isValid) {
				throw new AuthenticationError("Invalid credentials");
			}

			// Clean up old sessions for this user (optional)
			await prisma.session.deleteMany({
				where: {
					userId: user.id,
					expiresAt: { lt: new Date() },
				},
			});

			// Generate tokens and create session
			const { accessToken, refreshToken } = this.generateAuthTokens(user);
			await this.createSession(user.id, refreshToken, false);

			res.json({
				success: true,
				data: {
					user: this.formatUserResponse(user),
					accessToken,
					refreshToken,
				},
				message: "Login successful",
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Create guest account
	 */
	createGuest = async (req: Request, res: Response): Promise<void> => {
		try {
			const { locale = "en" }: CreateGuestRequest = req.body;

			// Validate locale
			if (!this.validateLocale(locale)) {
				throw new AuthValidationError("Invalid locale");
			}

			// Generate unique guest username
			const username = await this.generateUniqueGuestUsername();

			// Create guest user
			const user = await prisma.user.create({
				data: {
					username,
					isGuest: true,
					locale,
				},
			});

			// Generate tokens and create session
			const { accessToken, refreshToken } = this.generateAuthTokens(user);
			await this.createSession(user.id, refreshToken, true);

			res.status(201).json({
				success: true,
				data: {
					user: this.formatUserResponse(user),
					accessToken,
					refreshToken,
				},
				message: "Guest account created successfully",
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Refresh access token
	 */
	refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
		try {
			const { refreshToken }: RefreshTokenRequest = req.body;

			if (!refreshToken) {
				throw new AuthValidationError("Refresh token is required");
			}

			// Verify refresh token
			const payload = verifyRefreshToken(refreshToken);
			if (!payload) {
				throw new AuthenticationError("Invalid refresh token");
			}

			// Check if session exists and is valid
			const session = await prisma.session.findUnique({
				where: { token: refreshToken },
				include: { user: true },
			});

			if (!session || session.expiresAt < new Date()) {
				// Clean up expired session
				if (session) {
					await prisma.session.delete({ where: { token: refreshToken } });
				}
				throw new AuthenticationError("Invalid or expired refresh token");
			}

			// Generate new access token
			const newAccessToken = generateAccessToken({
				userId: session.user.id,
				username: session.user.username,
				isGuest: session.user.isGuest,
			});

			res.json({
				success: true,
				data: {
					accessToken: newAccessToken,
				},
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * User logout
	 */
	logout = async (req: Request, res: Response): Promise<void> => {
		try {
			const { refreshToken }: Partial<RefreshTokenRequest> = req.body;

			if (refreshToken) {
				await prisma.session.deleteMany({
					where: { token: refreshToken },
				});
			}

			res.json({
				success: true,
				data: null,
				message: "Logged out successfully",
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Logout from all devices
	 */
	logoutAll = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.userId;

			if (!userId) {
				throw new AuthenticationError("Unauthorized");
			}

			await prisma.session.deleteMany({
				where: { userId },
			});

			res.json({
				success: true,
				data: null,
				message: "Logged out from all devices successfully",
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Convert guest to regular user
	 */
	convertGuestToUser = async (req: Request, res: Response): Promise<void> => {
		try {
			const { email, password }: ConvertGuestRequest = req.body;
			const userId = req.user?.userId;

			if (!userId) {
				throw new AuthenticationError("Unauthorized");
			}

			if (!email || !password) {
				throw new AuthValidationError("Email and password are required");
			}

			// Validate email format
			if (!this.validateEmail(email)) {
				throw new AuthValidationError("Invalid email format");
			}

			// Validate password strength
			const passwordValidation = this.validatePassword(password);
			if (!passwordValidation.valid) {
				throw new AuthValidationError(
					passwordValidation.message || "Invalid password",
				);
			}

			// Get current user
			const user = await prisma.user.findUnique({
				where: { id: userId },
			});

			if (!user || !user.isGuest) {
				throw new AuthValidationError("Invalid user or not a guest account");
			}

			// Check if email already exists
			const existingEmail = await prisma.user.findUnique({
				where: { email },
				select: { id: true },
			});

			if (existingEmail) {
				throw new UserConflictError("Email already exists");
			}

			// Update user
			const hashedPassword = await hashPassword(password);
			const updatedUser = await prisma.user.update({
				where: { id: userId },
				data: {
					email,
					passwordHash: hashedPassword,
					isGuest: false,
				},
			});

			res.json({
				success: true,
				data: {
					user: this.formatUserResponse(updatedUser),
				},
				message: "Guest account converted to regular user successfully",
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Get current user profile
	 */
	getProfile = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.userId;

			if (!userId) {
				throw new AuthenticationError("Unauthorized");
			}

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
				throw new AuthenticationError("User not found");
			}

			res.json({
				success: true,
				data: {
					user: {
						...this.formatUserResponse(user),
						gameCount: user._count.playerProfiles,
					},
				},
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Update user profile
	 */
	updateProfile = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.userId;
			const { locale } = req.body;

			if (!userId) {
				throw new AuthenticationError("Unauthorized");
			}

			const updateData: { locale?: string } = {};

			if (locale) {
				if (!this.validateLocale(locale)) {
					throw new AuthValidationError("Invalid locale");
				}
				updateData.locale = locale;
			}

			const updatedUser = await prisma.user.update({
				where: { id: userId },
				data: updateData,
			});

			res.json({
				success: true,
				data: {
					user: this.formatUserResponse(updatedUser),
				},
				message: "Profile updated successfully",
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};
}

// Create and export controller instance
const authController = new AuthController();

export const {
	register,
	login,
	createGuest,
	refreshAccessToken,
	logout,
	logoutAll,
	convertGuestToUser,
	getProfile,
	updateProfile,
} = authController;

export default authController;
