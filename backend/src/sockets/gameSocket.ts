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

				// Notify others that player joined
				socket.to(roomName).emit(SocketEvent.PLAYER_JOINED, {
					player: {
						id: player.id,
						userId: player.userId,
						nickname: player.nickname,
						isHost: player.isHost,
						playerNumber: player.playerNumber,
					},
				});

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

				await gameManager.leaveGame(gameId, socket.userId);

				const roomName = `game:${gameId}`;
				socket.leave(roomName);

				// Notify others
				socket.to(roomName).emit(SocketEvent.PLAYER_LEFT, {
					userId: socket.userId,
					username: socket.username,
				});

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
				};

				// Send personalized update to each player with their role
				const sockets = await io.in(roomName).fetchSockets();
				for (const s of sockets) {
					const socketWithAuth = s as unknown as SocketWithAuth;
					const playerData = startedGame.players.find(
						(p) => p.userId === socketWithAuth.userId,
					);

					if (playerData) {
						socketWithAuth.emit(SocketEvent.GAME_STARTED, {
							game: gameData,
							yourRole: playerData.role,
							players: startedGame.players.map((p) => ({
								id: p.id,
								userId: p.userId,
								nickname: p.nickname,
								isAlive: p.isAlive,
								playerNumber: p.playerNumber,
								// Only show role to the player themselves
								role: p.userId === socketWithAuth.userId ? p.role : undefined,
							})),
						});
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
				// TODO: mark the player as disconnected rather than removing them
				const roomName = `game:${gameId}`;
				socket.to(roomName).emit("player-disconnected", {
					userId: socket.userId,
					username: socket.username,
				});
			}
		});
	});
};
