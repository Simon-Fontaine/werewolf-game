import { useAuthStore } from "@/stores/authStore";
import { useEffect, useRef } from "react";
import { type Socket, io } from "socket.io-client";

export const useSocket = () => {
	const socketRef = useRef<Socket | null>(null);
	const { accessToken } = useAuthStore();

	useEffect(() => {
		if (!accessToken) {
			if (socketRef.current) {
				socketRef.current.disconnect();
				socketRef.current = null;
			}
			return;
		}

		const socket = io(
			process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001",
			{
				auth: {
					token: accessToken,
				},
				withCredentials: true,
			},
		);

		socketRef.current = socket;

		socket.on("connect", () => {
			console.log("Connected to server");
		});

		socket.on("disconnect", () => {
			console.log("Disconnected from server");
		});

		socket.on("error", (error: { message: string }) => {
			console.error("Socket error:", error);
		});

		return () => {
			socket.disconnect();
		};
	}, [accessToken]);

	return socketRef.current;
};
