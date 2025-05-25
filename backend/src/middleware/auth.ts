import type { ApiResponse } from "@shared/types";
import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/auth";

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

export function requiredAuthentication(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			res.status(401).json({
				success: false,
				message: "Authentication token is required",
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
		console.error("Authentication error:", error);
		res.status(401).json({
			success: false,
			message: "Authentication failed",
		} as ApiResponse);
	}
}

export function optionalAuthentication(
	req: Request,
	res: Response,
	next: NextFunction,
) {
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
		console.error("Optional authentication error:", error);
	} finally {
		next();
	}
}
