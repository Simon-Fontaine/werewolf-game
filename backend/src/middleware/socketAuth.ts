import type { Socket } from "socket.io";
import { verifyAccessToken } from "../utils/auth";

export interface AuthenticatedSocket extends Socket {
	userId?: string;
	username?: string;
	isGuest?: boolean;
}

export async function socketAuthentication(
	socket: AuthenticatedSocket,
	next: (err?: Error) => void,
) {
	try {
		const token = socket.handshake.auth.token;
		if (!token) return next(new Error("Authentication token is required"));

		const payload = verifyAccessToken(token);
		socket.userId = payload.userId;
		socket.username = payload.username;
		socket.isGuest = payload.isGuest;

		next();
	} catch (error) {
		console.error("Socket authentication error:", error);
		next(new Error("Authentication failed"));
	}
}
