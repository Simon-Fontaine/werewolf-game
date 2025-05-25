import type { User } from "@prisma/client";

export interface JwtUser {
  userId: string;
  username: string;
  isGuest: boolean;
}

export interface AuthRequest extends Express.Request {
  user?: JwtUser;
}

export type SafeUser = Omit<User, "passwordHash">;
