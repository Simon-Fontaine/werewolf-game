import type { ApiResponse } from "@shared/types";
import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/auth";

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

export const authenticate = (
	req: Request,
	res: Response,
	next: NextFunction,
): void => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			res.status(401).json({
				success: false,
				error: "No token provided",
			} as ApiResponse);
			return;
		}

		const token = authHeader.substring(7);
		const payload = verifyAccessToken(token);

		req.user = {
			userId: payload.userId,
			username: payload.username,
			isGuest: payload.isGuest,
		};

		next();
	} catch (error) {
		res.status(401).json({
			success: false,
			error: "Invalid or expired token",
		} as ApiResponse);
	}
};

export const optionalAuthenticate = (
	req: Request,
	res: Response,
	next: NextFunction,
): void => {
	try {
		const authHeader = req.headers.authorization;
		if (authHeader?.startsWith("Bearer ")) {
			const token = authHeader.substring(7);
			const payload = verifyAccessToken(token);

			req.user = {
				userId: payload.userId,
				username: payload.username,
				isGuest: payload.isGuest,
			};
		}
	} catch (error) {
		// Ignore errors for optional auth
	}

	next();
};
