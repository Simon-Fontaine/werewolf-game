import type { TokenPayload } from "@werewolf/shared";
import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { config } from "../../config";
import type { AuthenticatedSocket } from "./socket.types";

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
) {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;

    // Attach user info to socket
    const authSocket = socket as AuthenticatedSocket;
    authSocket.userId = payload.userId;
    authSocket.username = payload.username;
    authSocket.isGuest = payload.isGuest;

    next();
  } catch (error) {
    next(new Error("Authentication failed"));
  }
}
