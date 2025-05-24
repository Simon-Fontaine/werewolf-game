import { SocketEvent } from "@shared/types";
import type { Server } from "socket.io";
import { prisma } from "../index";
import type { SocketWithAuth } from "../middleware/socketAuth";
import { gameManager } from "../services/gameManager";

export const setupGameSocket = (io: Server) => {
	io.on("connection", (socket: SocketWithAuth) => {
		console.log(`User connected: ${socket.userId} (${socket.username})`);

		// Join game room
		socket.on(SocketEvent.JOIN_GAME, async (gameCode: string) => {
			try {
				const game = await gameManager.getGameByCode(gameCode);

				if (!game) {
					socket.emit("error", { message: "Game not found" });
					return;
				}

				// Check if player is in the game
				const player = game.players.find((p) => p.userId === socket.userId);
				if (!player) {
					socket.emit("error", { message: "You are not in this game" });
					return;
				}

				// Join socket room
				const roomName = `game:${game.id}`;
				socket.join(roomName);

				// Store game info on socket
				socket.data.gameId = game.id;
				socket.data.gameCode = game.code;
				socket.data.playerId = player.id;

				// Send current game state to the player
				socket.emit(SocketEvent.GAME_UPDATE, {
					game: {
						id: game.id,
						code: game.code,
						status: game.status,
						phase: game.phase,
						dayNumber: game.dayNumber,
						settings: game.settings,
						players: game.players.map((p) => ({
							id: p.id,
							userId: p.userId,
							nickname: p.nickname,
							isHost: p.isHost,
							isAlive: p.isAlive,
							playerNumber: p.playerNumber,
							// Only send role to the player themselves
							role: p.userId === socket.userId ? p.role : undefined,
						})),
					},
				});

				// Don't notify others if this is a reconnection
				// Check if this user already has another socket in the room
				const socketsInRoom = await io.in(roomName).fetchSockets();
				const existingSocketCount = socketsInRoom.filter(
					(s) => (s as unknown as SocketWithAuth).userId === socket.userId,
				).length;

				// Only announce if this is their first socket connection
				if (existingSocketCount <= 1) {
					socket.to(roomName).emit(SocketEvent.PLAYER_JOINED, {
						player: {
							id: player.id,
							userId: player.userId,
							nickname: player.nickname,
							isHost: player.isHost,
							isAlive: player.isAlive,
							playerNumber: player.playerNumber,
						},
					});
				}
			} catch (error) {
				console.error("Join game error:", error);
				socket.emit("error", { message: "Failed to join game" });
			}
		});

		// Leave game
		socket.on(SocketEvent.LEAVE_GAME, async () => {
			try {
				const gameId = socket.data.gameId;
				if (!gameId || !socket.userId) return;

				const roomName = `game:${gameId}`;

				// Check if user has other connections in the same game
				const socketsInRoom = await io.in(roomName).fetchSockets();
				const userSockets = socketsInRoom.filter(
					(s) => (s as unknown as SocketWithAuth).userId === socket.userId,
				);

				// Only process leave if this is their last connection
				if (userSockets.length <= 1) {
					await gameManager.leaveGame(gameId, socket.userId);

					// Notify others
					socket.to(roomName).emit(SocketEvent.PLAYER_LEFT, {
						userId: socket.userId,
						username: socket.username,
					});
				}

				socket.leave(roomName);

				// Clear socket data
				socket.data.gameId = undefined;
				socket.data.gameCode = undefined;
				socket.data.playerId = undefined;
			} catch (error) {
				console.error("Leave game error:", error);
				socket.emit("error", { message: "Failed to leave game" });
			}
		});

		// Start game (host only)
		socket.on(SocketEvent.START_GAME, async () => {
			try {
				const gameId = socket.data.gameId;
				if (!gameId || !socket.userId) {
					socket.emit("error", { message: "Not in a game" });
					return;
				}

				const game = await gameManager.getGame(gameId);
				if (!game) {
					socket.emit("error", { message: "Game not found" });
					return;
				}

				// Check if user is host
				const player = game.players.find((p) => p.userId === socket.userId);
				if (!player?.isHost) {
					socket.emit("error", { message: "Only the host can start the game" });
					return;
				}

				// Check minimum players
				const settings = game.settings as { minPlayers: number };
				if (game.players.length < settings.minPlayers) {
					socket.emit("error", {
						message: `Need at least ${settings.minPlayers} players to start`,
					});
					return;
				}

				// Start the game
				const startedGame = await gameManager.startGame(gameId);

				// Emit game started to all players with their roles
				const roomName = `game:${gameId}`;
				const gameData = {
					id: startedGame.id,
					status: startedGame.status,
					phase: startedGame.phase,
					dayNumber: startedGame.dayNumber,
					settings: startedGame.settings,
				};

				// Get all unique users in the room
				const socketsInRoom = await io.in(roomName).fetchSockets();
				const userSocketMap = new Map<string, SocketWithAuth[]>();

				for (const s of socketsInRoom) {
					const socketWithAuth = s as unknown as SocketWithAuth;
					const userId = socketWithAuth.userId;
					if (userId) {
						if (!userSocketMap.has(userId)) {
							userSocketMap.set(userId, []);
						}
						const userSockets = userSocketMap.get(userId);
						if (userSockets) {
							userSockets.push(socketWithAuth);
						}
					}
				}

				// Send to each unique user
				for (const [userId, userSockets] of userSocketMap) {
					const playerData = startedGame.players.find(
						(p) => p.userId === userId,
					);

					if (playerData) {
						const gameStartData = {
							game: gameData,
							yourRole: playerData.role,
							players: startedGame.players.map((p) => ({
								id: p.id,
								userId: p.userId,
								nickname: p.nickname,
								isAlive: p.isAlive,
								playerNumber: p.playerNumber,
								isHost: p.isHost,
								// Only show role to the player themselves
								role: p.userId === userId ? p.role : undefined,
							})),
						};

						// Send to all sockets of this user
						for (const userSocket of userSockets) {
							userSocket.emit(SocketEvent.GAME_STARTED, gameStartData);
						}
					}
				}
			} catch (error) {
				console.error("Start game error:", error);
				socket.emit("error", { message: "Failed to start game" });
			}
		});

		// Handle disconnection
		socket.on("disconnect", async () => {
			console.log(`User disconnected: ${socket.userId}`);

			// Handle leaving game if in one
			const gameId = socket.data.gameId;
			if (gameId && socket.userId) {
				const roomName = `game:${gameId}`;

				// Check if user has other connections in the same game
				const socketsInRoom = await io.in(roomName).fetchSockets();
				const hasOtherConnections = socketsInRoom.some(
					(s) =>
						s.id !== socket.id &&
						(s as unknown as SocketWithAuth).userId === socket.userId,
				);

				if (!hasOtherConnections) {
					socket.to(roomName).emit("player-disconnected", {
						userId: socket.userId,
						username: socket.username,
					});
				}
			}
		});
	});
};
