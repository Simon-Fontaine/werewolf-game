import type { AuthenticatedSocket } from "@/middleware/socketAuth";
import { type GameWithRelations, gameManager } from "@/services/gameManager";
import { GameValidationError } from "@/services/gameManager";
import { type GameSettings, SocketEvent } from "@shared/types";
import type { Server } from "socket.io";
import type { GamePlayer, Role } from "../../generated/prisma";

interface GameStateForPlayer {
	id: string;
	code: string;
	status: string;
	phase: string;
	dayNumber: number;
	settings: GameSettings;
	players: Array<{
		id: string;
		userId: string;
		nickname: string;
		isHost: boolean;
		isAlive: boolean;
		playerNumber: number;
		role?: Role | null;
	}>;
}

class GameSocketHandler {
	constructor(private io: Server) {}

	/**
	 * Formats game state for a specific player
	 */
	private formatGameStateForPlayer(
		game: GameWithRelations,
		viewerUserId: string | undefined,
	): GameStateForPlayer {
		return {
			id: game.id,
			code: game.code,
			status: game.status,
			phase: game.phase,
			dayNumber: game.dayNumber,
			settings: game.settings as unknown as GameSettings,
			players: game.players.map((p: GamePlayer) => ({
				id: p.id,
				userId: p.userId,
				nickname: p.nickname,
				isHost: p.isHost,
				isAlive: p.isAlive,
				playerNumber: p.playerNumber,
				role: p.userId === viewerUserId ? p.role : undefined,
			})),
		};
	}

	/**
	 * Sends error message to socket
	 */
	private sendError(
		socket: AuthenticatedSocket,
		message: string,
		code?: string,
	): void {
		socket.emit("error", { message, code });
		console.error(`Socket error for user ${socket.username}: ${message}`);
	}

	/**
	 * Validates socket has required game context
	 */
	private validateGameContext(socket: AuthenticatedSocket): {
		gameId: string;
		userId: string;
	} {
		const gameId = socket.data.gameId;
		const userId = socket.userId;

		if (!gameId || !userId) {
			throw new GameValidationError("Not in a game");
		}

		return { gameId, userId };
	}

	/**
	 * Finds socket by user ID
	 */
	private findSocketByUserId(userId: string): AuthenticatedSocket | undefined {
		return Array.from(this.io.sockets.sockets.values()).find(
			(s) => (s as AuthenticatedSocket).userId === userId,
		) as AuthenticatedSocket | undefined;
	}

	/**
	 * Handle joining a game room
	 */
	async handleJoinGame(
		socket: AuthenticatedSocket,
		gameCode: string,
	): Promise<void> {
		try {
			console.log(
				`User ${socket.username} attempting to join game ${gameCode}`,
			);

			const game = await gameManager.getGameByCode(gameCode);
			if (!game) {
				this.sendError(socket, "Game not found", "GAME_NOT_FOUND");
				return;
			}

			// Check if player is in the game
			const player = game.players.find((p) => p.userId === socket.userId);
			if (!player) {
				this.sendError(
					socket,
					"You are not in this game",
					"PLAYER_NOT_IN_GAME",
				);
				return;
			}

			// Leave previous game rooms
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
				game: this.formatGameStateForPlayer(game, socket.userId),
			});
		} catch (error) {
			console.error("Join game error:", error);
			this.sendError(socket, "Failed to join game");
		}
	}

	/**
	 * Handle game start (host only)
	 */
	async handleStartGame(socket: AuthenticatedSocket): Promise<void> {
		try {
			const { gameId, userId } = this.validateGameContext(socket);

			console.log(`User ${socket.username} attempting to start game`);

			const game = await gameManager.getGame(gameId);
			if (!game) {
				this.sendError(socket, "Game not found", "GAME_NOT_FOUND");
				return;
			}

			const player = game.players.find((p) => p.userId === userId);
			if (!player?.isHost) {
				this.sendError(socket, "Only the host can start the game", "NOT_HOST");
				return;
			}

			// Start the game
			const startedGame = await gameManager.startGame(gameId);
			const roomName = `game:${gameId}`;

			// Send game started event to all players
			this.io.to(roomName).emit(SocketEvent.GAME_STARTED, {
				game: {
					id: startedGame.id,
					status: startedGame.status,
					phase: startedGame.phase,
					dayNumber: startedGame.dayNumber,
					settings: startedGame.settings,
				},
			});

			// Send individual role information to each player
			for (const gamePlayer of startedGame.players) {
				const playerSocket = this.findSocketByUserId(gamePlayer.userId);

				if (playerSocket) {
					playerSocket.emit("role-assigned", {
						role: gamePlayer.role,
						players: this.formatGameStateForPlayer(
							startedGame,
							gamePlayer.userId,
						).players,
					});
				}
			}

			// TODO: Start the game logic
			// This will handle the game loop and initial actions

			console.log(`Game ${gameId} started successfully`);
		} catch (error) {
			console.error("Start game error:", error);
			if (error instanceof GameValidationError) {
				this.sendError(socket, error.message, error.code);
			} else {
				this.sendError(socket, "Failed to start game");
			}
		}
	}

	/**
	 * Handle leaving game
	 */
	async handleLeaveGame(socket: AuthenticatedSocket): Promise<void> {
		try {
			const gameId = socket.data.gameId;
			const userId = socket.userId;

			if (!gameId || !userId) return;

			console.log(
				`User ${socket.username} leaving game ${socket.data.gameCode}`,
			);

			const updatedGame = await gameManager.leaveGame(gameId, userId);
			const roomName = `game:${gameId}`;

			socket.leave(roomName);

			if (updatedGame) {
				// Notify remaining players
				this.io.to(roomName).emit(SocketEvent.GAME_UPDATE, {
					game: this.formatGameStateForPlayer(updatedGame, ""), // No specific viewer for broadcast
				});
			} else {
				// Game was deleted
				this.io.to(roomName).emit(SocketEvent.GAME_DELETED);
			}

			// Clear socket data
			socket.data.gameId = undefined;
			socket.data.gameCode = undefined;
		} catch (error) {
			console.error("Leave game error:", error);
			if (error instanceof GameValidationError) {
				this.sendError(socket, error.message, error.code);
			} else {
				this.sendError(socket, "Failed to leave game");
			}
		}
	}

	/**
	 * Handle socket disconnection
	 */
	async handleDisconnect(socket: AuthenticatedSocket): Promise<void> {
		console.log(`User disconnected: ${socket.userId}`);
		// Could implement auto-leave logic here if desired
	}
}

export const setupGameSocket = (io: Server) => {
	const handler = new GameSocketHandler(io);

	io.on("connection", (socket: AuthenticatedSocket) => {
		console.log(`User connected: ${socket.userId} (${socket.username})`);

		// Store user info on socket for easy access
		socket.data.userId = socket.userId;
		socket.data.username = socket.username;

		// Event handlers
		socket.on(SocketEvent.JOIN_GAME, (gameCode: string) =>
			handler.handleJoinGame(socket, gameCode),
		);

		socket.on(SocketEvent.START_GAME, () => handler.handleStartGame(socket));

		socket.on(SocketEvent.LEAVE_GAME, () => handler.handleLeaveGame(socket));

		socket.on("disconnect", () => handler.handleDisconnect(socket));
	});
};
