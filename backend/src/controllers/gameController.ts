import type { ApiResponse, GameSettings } from "@shared/types";
import type { Request, Response } from "express";
import {
	type GamePlayer,
	GameStatus,
	type Prisma,
} from "../../generated/prisma";
import {
	GameNotFoundError,
	GameValidationError,
	type GameWithRelations,
	PlayerError,
} from "../services/gameManager";
import { gameManager } from "../services/gameManager";

// Validation schemas
interface CreateGameRequest {
	settings?: Partial<GameSettings>;
	locale?: string;
}

interface JoinGameRequest {
	code: string;
}

class GameController {
	/**
	 * Validates user authentication
	 */
	private validateAuth(req: Request): {
		userId: string;
		username: string;
	} {
		const userId = req.user?.userId;
		const username = req.user?.username;

		if (!userId || !username) {
			throw new Error("Unauthorized");
		}

		return { userId, username };
	}

	/**
	 * Formats game data for API response
	 */
	private formatGameForResponse(
		game: GameWithRelations,
		viewerUserId?: string,
	) {
		return {
			id: game.id,
			code: game.code,
			status: game.status,
			phase: game.phase,
			dayNumber: game.dayNumber,
			settings: game.settings,
			playerCount: game.players?.length || 0,
			createdAt: game.createdAt,
			startedAt: game.startedAt,
			endedAt: game.endedAt,
			players:
				game.players?.map((p: GamePlayer) => ({
					id: p.id,
					userId: p.userId,
					nickname: p.nickname,
					isHost: p.isHost,
					isAlive: p.isAlive,
					playerNumber: p.playerNumber,
					// Only include role for the requesting user or if game is completed
					role:
						p.userId === viewerUserId || game.status === GameStatus.COMPLETED
							? p.role
							: undefined,
				})) || [],
		};
	}

	/**
	 * Sends error response with appropriate status code
	 */
	private sendErrorResponse(res: Response, error: unknown): void {
		console.error("Game controller error:", error);

		if (error instanceof GameNotFoundError) {
			res.status(404).json({
				success: false,
				error: error.message,
				code: error.code,
			} as ApiResponse);
		} else if (error instanceof GameValidationError) {
			res.status(400).json({
				success: false,
				error: error.message,
				code: error.code,
			} as ApiResponse);
		} else if (error instanceof PlayerError) {
			res.status(403).json({
				success: false,
				error: error.message,
				code: error.code,
			} as ApiResponse);
		} else if (error instanceof Error) {
			if (error.message === "Unauthorized") {
				res.status(401).json({
					success: false,
					error: "Unauthorized",
					code: "UNAUTHORIZED",
				} as ApiResponse);
			} else {
				res.status(500).json({
					success: false,
					error: error.message,
					code: "INTERNAL_ERROR",
				} as ApiResponse);
			}
		} else {
			res.status(500).json({
				success: false,
				error: "An unexpected error occurred",
				code: "UNKNOWN_ERROR",
			} as ApiResponse);
		}
	}

	/**
	 * Creates a new game
	 */
	createGame = async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId, username } = this.validateAuth(req);
			const { settings, locale = "en" }: CreateGameRequest = req.body;

			// Validate request body
			if (settings && typeof settings !== "object") {
				throw new GameValidationError("Settings must be an object");
			}

			if (locale && typeof locale !== "string") {
				throw new GameValidationError("Locale must be a string");
			}

			const game = await gameManager.createGame(
				userId,
				username,
				locale,
				settings,
			);

			res.status(201).json({
				success: true,
				data: {
					game: this.formatGameForResponse(game, userId),
				},
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Joins an existing game
	 */
	joinGame = async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId, username } = this.validateAuth(req);
			const { code }: JoinGameRequest = req.body;

			// Validate request body
			if (!code) {
				throw new GameValidationError("Game code is required");
			}

			if (typeof code !== "string" || code.trim().length === 0) {
				throw new GameValidationError("Game code must be a non-empty string");
			}

			const game = await gameManager.joinGame(
				code.trim().toUpperCase(),
				userId,
				username,
			);
			const player = game.players.find((p) => p.userId === userId);

			if (!player) {
				throw new PlayerError("Failed to join game");
			}

			res.json({
				success: true,
				data: {
					game: this.formatGameForResponse(game, userId),
					player: {
						id: player.id,
						playerNumber: player.playerNumber,
						isHost: player.isHost,
						nickname: player.nickname,
					},
				},
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Gets a specific game by code
	 */
	getGame = async (req: Request, res: Response): Promise<void> => {
		try {
			const { code } = req.params;
			const userId = req.user?.userId; // Optional for this endpoint

			if (!code || typeof code !== "string") {
				throw new GameValidationError("Valid game code is required");
			}

			const game = await gameManager.getGameByCode(code.trim().toUpperCase());

			if (!game) {
				throw new GameNotFoundError();
			}

			// Check if user is in the game (if authenticated)
			if (userId) {
				const isPlayerInGame = game.players.some((p) => p.userId === userId);
				if (!isPlayerInGame && game.status !== GameStatus.COMPLETED) {
					// Don't show sensitive info for non-participants in active games
					const publicGame = {
						id: game.id,
						code: game.code,
						status: game.status,
						playerCount: game.players.length,
						settings: {
							maxPlayers: (game.settings as unknown as GameSettings)
								?.maxPlayers,
							minPlayers: (game.settings as unknown as GameSettings)
								?.minPlayers,
						},
					};

					res.json({
						success: true,
						data: { game: publicGame },
					} as ApiResponse);
					return;
				}
			}

			res.json({
				success: true,
				data: {
					game: this.formatGameForResponse(game, userId),
				},
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Gets all games for the authenticated user
	 */
	getUserGames = async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId } = this.validateAuth(req);

			// Parse query parameters
			const page = Math.max(1, Number.parseInt(req.query.page as string) || 1);
			const limit = Math.min(
				50,
				Math.max(1, Number.parseInt(req.query.limit as string) || 10),
			);
			const status = req.query.status as GameStatus;

			// Build where clause
			const whereClause: Prisma.GameWhereInput = {
				players: {
					some: {
						userId,
					},
				},
			};

			// Filter by status if provided
			if (status) {
				if (Object.values(GameStatus).includes(status as GameStatus)) {
					whereClause.status = status;
				} else {
					throw new GameValidationError("Invalid game status filter");
				}
			} else {
				// Default to active games only
				whereClause.status = {
					in: [GameStatus.LOBBY, GameStatus.IN_PROGRESS],
				};
			}

			// Get games with pagination
			const [games, totalCount] = await Promise.all([
				gameManager.getUserGames(userId, {
					page,
					limit,
					status: status as GameStatus,
				}),
				gameManager.getUserGamesCount(userId, status as GameStatus),
			]);

			const formattedGames = games.map((game) => ({
				id: game.id,
				code: game.code,
				status: game.status,
				phase: game.phase,
				dayNumber: game.dayNumber,
				playerCount: game.players.length,
				isHost: game.players.some((p) => p.userId === userId && p.isHost),
				createdAt: game.createdAt,
				startedAt: game.startedAt,
				endedAt: game.endedAt,
				settings: {
					maxPlayers: (game.settings as unknown as GameSettings)?.maxPlayers,
					minPlayers: (game.settings as unknown as GameSettings)?.minPlayers,
				},
			}));

			res.json({
				success: true,
				data: {
					games: formattedGames,
					pagination: {
						page,
						limit,
						total: totalCount,
						totalPages: Math.ceil(totalCount / limit),
						hasNext: page * limit < totalCount,
						hasPrev: page > 1,
					},
				},
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Leaves a game
	 */
	leaveGame = async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId } = this.validateAuth(req);
			const { code } = req.params;

			if (!code) {
				throw new GameValidationError("Game code is required");
			}

			const game = await gameManager.getGameByCode(code.trim().toUpperCase());
			if (!game) {
				throw new GameNotFoundError();
			}

			const updatedGame = await gameManager.leaveGame(game.id, userId);

			if (updatedGame) {
				res.json({
					success: true,
					data: {
						game: this.formatGameForResponse(updatedGame),
					},
					message: "Successfully left the game",
				} as ApiResponse);
			} else {
				res.json({
					success: true,
					data: null,
					message: "Game was deleted (last player left)",
				} as ApiResponse);
			}
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Gets game statistics for the user
	 */
	getUserStats = async (req: Request, res: Response): Promise<void> => {
		try {
			const { userId } = this.validateAuth(req);

			const stats = await gameManager.getUserGameStats(userId);

			res.json({
				success: true,
				data: { stats },
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};

	/**
	 * Health check endpoint
	 */
	healthCheck = async (req: Request, res: Response): Promise<void> => {
		try {
			const activeGamesCount = await gameManager.getActiveGamesCount();

			res.json({
				success: true,
				data: {
					status: "healthy",
					activeGames: activeGamesCount,
					timestamp: new Date().toISOString(),
				},
			} as ApiResponse);
		} catch (error) {
			this.sendErrorResponse(res, error);
		}
	};
}

// Create and export controller instance
const gameController = new GameController();

export const {
	createGame,
	joinGame,
	getGame,
	getUserGames,
	leaveGame,
	getUserStats,
	healthCheck,
} = gameController;

export default gameController;
