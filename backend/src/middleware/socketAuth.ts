import type { Socket } from "socket.io";
import { verifyAccessToken } from "../utils/auth";

export interface SocketWithAuth extends Socket {
	userId?: string;
	username?: string;
	isGuest?: boolean;
}

export const authenticateSocket = async (
	socket: SocketWithAuth,
	next: (err?: Error) => void,
) => {
	try {
		const token = socket.handshake.auth.token;

		if (!token) {
			return next(new Error("No token provided"));
		}

		const payload = verifyAccessToken(token);

		socket.userId = payload.userId;
		socket.username = payload.username;
		socket.isGuest = payload.isGuest;

		next();
	} catch (error) {
		next(new Error("Invalid token"));
	}
};
