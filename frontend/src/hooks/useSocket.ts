import { useAuthStore } from "@/stores/authStore";
import { useEffect, useRef } from "react";
import { type Socket, io } from "socket.io-client";

export const useSocket = () => {
	const socketRef = useRef<Socket | null>(null);
	const { accessToken } = useAuthStore();

	useEffect(() => {
		// Only create socket if we have a token and don't already have a socket
		if (!accessToken) {
			if (socketRef.current) {
				console.log("Disconnecting socket - no access token");
				socketRef.current.disconnect();
				socketRef.current = null;
			}
			return;
		}

		// If we already have a connected socket, don't create a new one
		if (socketRef.current?.connected) {
			return;
		}

		console.log("Creating new socket connection");
		const socket = io(
			process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001",
			{
				auth: {
					token: accessToken,
				},
				withCredentials: true,
				transports: ["websocket", "polling"],
				reconnection: true,
				reconnectionDelay: 1000,
				reconnectionAttempts: 5,
			},
		);

		socketRef.current = socket;

		socket.on("connect", () => {
			console.log("Socket connected:", socket.id);
		});

		socket.on("disconnect", (reason) => {
			console.log("Socket disconnected:", reason);
		});

		socket.on("connect_error", (error) => {
			console.error("Socket connection error:", error.message);
		});

		socket.on("error", (error) => {
			console.error("Socket error:", error);
		});

		return () => {
			// Don't disconnect on cleanup to prevent issues with React StrictMode
			// The socket will be disconnected when the token changes or is removed
		};
	}, [accessToken]);

	return socketRef.current;
};
