import type { ApiResponse } from "@shared/types";
import type { Request, Response } from "express";
import { prisma } from "../index";

import {
	comparePassword,
	generateAccessToken,
	generateGuestUsername,
	generateRefreshToken,
	hashPassword,
	verifyRefreshToken,
} from "../utils/auth";

// Extend Express Request type
declare global {
	namespace Express {
		interface Request {
			user?: {
				userId: string;
				username: string;
				isGuest: boolean;
			};
		}
	}
}

export const register = async (req: Request, res: Response): Promise<void> => {
	try {
		const { email, username, password, locale = "en" } = req.body;

		// Validate input
		if (!email || !username || !password) {
			res.status(400).json({
				success: false,
				error: "Email, username, and password are required",
			} as ApiResponse);
			return;
		}

		// Check if user already exists
		const existingUser = await prisma.user.findFirst({
			where: {
				OR: [{ email }, { username }],
			},
		});

		if (existingUser) {
			res.status(400).json({
				success: false,
				error: "User with this email or username already exists",
			} as ApiResponse);
			return;
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

		// Generate tokens
		const tokenPayload = {
			userId: user.id,
			username: user.username,
			isGuest: user.isGuest,
		};
		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		// Save refresh token
		await prisma.session.create({
			data: {
				userId: user.id,
				token: refreshToken,
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
			},
		});

		res.json({
			success: true,
			data: {
				user: {
					id: user.id,
					username: user.username,
					email: user.email,
					isGuest: user.isGuest,
					locale: user.locale,
				},
				accessToken,
				refreshToken,
			},
		} as ApiResponse);
	} catch (error) {
		console.error("Register error:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
		} as ApiResponse);
	}
};

export const login = async (req: Request, res: Response): Promise<void> => {
	try {
		const { username, password } = req.body;

		if (!username || !password) {
			res.status(400).json({
				success: false,
				error: "Username and password are required",
			} as ApiResponse);
			return;
		}

		// Find user
		const user = await prisma.user.findUnique({
			where: { username },
		});

		if (!user || !user.passwordHash) {
			res.status(401).json({
				success: false,
				error: "Invalid credentials",
			} as ApiResponse);
			return;
		}

		// Check password
		const isValid = await comparePassword(password, user.passwordHash);
		if (!isValid) {
			res.status(401).json({
				success: false,
				error: "Invalid credentials",
			} as ApiResponse);
			return;
		}

		// Generate tokens
		const tokenPayload = {
			userId: user.id,
			username: user.username,
			isGuest: user.isGuest,
		};
		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		// Save refresh token
		await prisma.session.create({
			data: {
				userId: user.id,
				token: refreshToken,
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			},
		});

		res.json({
			success: true,
			data: {
				user: {
					id: user.id,
					username: user.username,
					email: user.email,
					isGuest: user.isGuest,
					locale: user.locale,
				},
				accessToken,
				refreshToken,
			},
		} as ApiResponse);
	} catch (error) {
		console.error("Login error:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
		} as ApiResponse);
	}
};

export const createGuest = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const { locale = "en" } = req.body;

		// Generate unique guest username
		let username = generateGuestUsername();
		let attempts = 0;
		while (attempts < 5) {
			const existing = await prisma.user.findUnique({ where: { username } });
			if (!existing) break;
			username = generateGuestUsername();
			attempts++;
		}

		// Create guest user
		const user = await prisma.user.create({
			data: {
				username,
				isGuest: true,
				locale,
			},
		});

		// Generate tokens
		const tokenPayload = {
			userId: user.id,
			username: user.username,
			isGuest: user.isGuest,
		};
		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		// Save refresh token
		await prisma.session.create({
			data: {
				userId: user.id,
				token: refreshToken,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days for guests
			},
		});

		res.json({
			success: true,
			data: {
				user: {
					id: user.id,
					username: user.username,
					isGuest: user.isGuest,
					locale: user.locale,
				},
				accessToken,
				refreshToken,
			},
		} as ApiResponse);
	} catch (error) {
		console.error("Create guest error:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
		} as ApiResponse);
	}
};

export const refreshAccessToken = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const { refreshToken } = req.body;

		if (!refreshToken) {
			res.status(400).json({
				success: false,
				error: "Refresh token is required",
			} as ApiResponse);
			return;
		}

		// Verify refresh token
		const payload = verifyRefreshToken(refreshToken);

		if (!payload) {
			res.status(401).json({
				success: false,
				error: "Invalid refresh token",
			} as ApiResponse);
			return;
		}

		// Check if session exists
		const session = await prisma.session.findUnique({
			where: { token: refreshToken },
			include: { user: true },
		});

		if (!session || session.expiresAt < new Date()) {
			res.status(401).json({
				success: false,
				error: "Invalid or expired refresh token",
			} as ApiResponse);
			return;
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
		console.error("Refresh token error:", error);
		res.status(401).json({
			success: false,
			error: "Invalid refresh token",
		} as ApiResponse);
	}
};

export const logout = async (req: Request, res: Response): Promise<void> => {
	try {
		const { refreshToken } = req.body;

		if (refreshToken) {
			// Delete the session
			await prisma.session
				.delete({
					where: { token: refreshToken },
				})
				.catch(() => {
					// Ignore if session doesn't exist
				});
		}

		res.json({
			success: true,
			data: { message: "Logged out successfully" },
		} as ApiResponse);
	} catch (error) {
		console.error("Logout error:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
		} as ApiResponse);
	}
};

export const convertGuestToUser = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const { email, password } = req.body;
		const userId = req.user?.userId; // From auth middleware

		if (!userId) {
			res.status(401).json({
				success: false,
				error: "Unauthorized",
			} as ApiResponse);
			return;
		}

		const user = await prisma.user.findUnique({
			where: { id: userId },
		});

		if (!user || !user.isGuest) {
			res.status(400).json({
				success: false,
				error: "Invalid user or not a guest",
			} as ApiResponse);
			return;
		}

		// Check if email already exists
		const existingEmail = await prisma.user.findUnique({
			where: { email },
		});

		if (existingEmail) {
			res.status(400).json({
				success: false,
				error: "Email already in use",
			} as ApiResponse);
			return;
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
				user: {
					id: updatedUser.id,
					username: updatedUser.username,
					email: updatedUser.email,
					isGuest: updatedUser.isGuest,
					locale: updatedUser.locale,
				},
			},
		} as ApiResponse);
	} catch (error) {
		console.error("Convert guest error:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
		} as ApiResponse);
	}
};
