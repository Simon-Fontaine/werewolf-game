import { useAuthStore } from "@/stores/authStore";
import { useEffect, useRef, useState } from "react";
import { type Socket, io } from "socket.io-client";

export const useSocket = () => {
	const socketRef = useRef<Socket | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const { accessToken } = useAuthStore();

	useEffect(() => {
		if (!accessToken) {
			if (socketRef.current) {
				socketRef.current.disconnect();
				socketRef.current = null;
				setIsConnected(false);
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
				transports: ["websocket", "polling"],
			},
		);

		socketRef.current = socket;

		socket.on("connect", () => {
			console.log("Connected to server");
			setIsConnected(true);
		});

		socket.on("disconnect", () => {
			console.log("Disconnected from server");
			setIsConnected(false);
		});

		socket.on("error", (error: { message: string }) => {
			console.error("Socket error:", error);
		});

		return () => {
			socket.disconnect();
			setIsConnected(false);
		};
	}, [accessToken]);

	return socketRef.current;
};

export const useSocketStatus = () => {
	const socket = useSocket();
	return socket?.connected || false;
};
