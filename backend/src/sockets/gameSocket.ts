import { SocketEvent } from "@shared/types";
import type { Server } from "socket.io";
import type { SocketWithAuth } from "../middleware/socketAuth";
import { gameManager } from "../services/gameManager";

export const setupGameSocket = (io: Server) => {
	io.on("connection", (socket: SocketWithAuth) => {
		console.log(`User connected: ${socket.userId} (${socket.username})`);

		// Store user info on socket for easy access
		socket.data.userId = socket.userId;
		socket.data.username = socket.username;

		// Join game room
		socket.on(SocketEvent.JOIN_GAME, async (gameCode: string) => {
			try {
				console.log(
					`User ${socket.username} attempting to join game ${gameCode}`,
				);

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

				// Leave previous rooms
				const rooms = Array.from(socket.rooms);
				for (const room of rooms) {
					if (room !== socket.id && room.startsWith("game:")) {
						socket.leave(room);
					}
				}

				// Join new game room
				const roomName = `game:${game.id}`;
				await socket.join(roomName);

				console.log(`User ${socket.username} joined room ${roomName}`);

				// Store current game info on socket
				socket.data.gameId = game.id;
				socket.data.gameCode = game.code;

				// Send complete game state to the joining player
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
							role: p.userId === socket.userId ? p.role : undefined,
						})),
					},
				});
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

				console.log(
					`User ${socket.username} leaving game ${socket.data.gameCode}`,
				);

				await gameManager.leaveGame(gameId, socket.userId);

				const roomName = `game:${gameId}`;
				socket.leave(roomName);

				// Get updated game state
				const game = await gameManager.getGame(gameId);

				if (game) {
					// Notify remaining players
					io.to(roomName).emit(SocketEvent.GAME_UPDATE, {
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
							})),
						},
					});
				}

				// Clear socket data
				socket.data.gameId = undefined;
				socket.data.gameCode = undefined;
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

				console.log(`User ${socket.username} attempting to start game`);

				const game = await gameManager.getGame(gameId);
				if (!game) {
					socket.emit("error", { message: "Game not found" });
					return;
				}

				const player = game.players.find((p) => p.userId === socket.userId);
				if (!player?.isHost) {
					socket.emit("error", { message: "Only the host can start the game" });
					return;
				}

				const settings = game.settings as { minPlayers: number };
				if (game.players.length < settings.minPlayers) {
					socket.emit("error", {
						message: `Need at least ${settings.minPlayers} players to start`,
					});
					return;
				}

				// Start the game
				const startedGame = await gameManager.startGame(gameId);
				const roomName = `game:${gameId}`;

				// Send game started event to each player with their role
				io.to(roomName).emit(SocketEvent.GAME_STARTED, {
					game: {
						id: startedGame.id,
						status: startedGame.status,
						phase: startedGame.phase,
						dayNumber: startedGame.dayNumber,
						settings: startedGame.settings,
					},
				});

				// Send individual role information
				for (const player of startedGame.players) {
					const playerSocket = Array.from(io.sockets.sockets.values()).find(
						(s) => (s as SocketWithAuth).userId === player.userId,
					);

					if (playerSocket) {
						playerSocket.emit("role-assigned", {
							role: player.role,
							players: startedGame.players.map((p) => ({
								id: p.id,
								userId: p.userId,
								nickname: p.nickname,
								isAlive: p.isAlive,
								playerNumber: p.playerNumber,
								isHost: p.isHost,
								role: p.userId === player.userId ? p.role : undefined,
							})),
						});
					}
				}

				console.log(`Game ${gameId} started successfully`);
			} catch (error) {
				console.error("Start game error:", error);
				socket.emit("error", { message: "Failed to start game" });
			}
		});

		// Handle disconnection
		socket.on("disconnect", async () => {
			console.log(`User disconnected: ${socket.userId}`);
		});
	});
};
