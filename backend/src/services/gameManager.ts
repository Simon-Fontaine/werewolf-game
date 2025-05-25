import { prisma } from "@/index";
import type { GameSettings } from "@shared/types";
import {
	type ActionType,
	EventType,
	GamePhase,
	GameStatus,
	Prisma,
	Role,
} from "../../generated/prisma";

// Constants
const GAME_CODE_LENGTH = 6;
const GAME_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_CODE_GENERATION_ATTEMPTS = 5;

// Type definitions
const gameWithRelations = Prisma.validator<Prisma.GameDefaultArgs>()({
	include: {
		players: true,
		events: true,
		votes: true,
		actions: true,
	},
});

export type GameWithRelations = Prisma.GameGetPayload<typeof gameWithRelations>;

// Custom error classes
export class GameNotFoundError extends Error {
	code = "GAME_NOT_FOUND";
	constructor(message = "Game not found") {
		super(message);
		this.name = "GameNotFoundError";
	}
}

export class GameValidationError extends Error {
	code = "GAME_VALIDATION_ERROR";
	constructor(message: string) {
		super(message);
		this.name = "GameValidationError";
	}
}

export class PlayerError extends Error {
	code = "PLAYER_ERROR";
	constructor(message: string) {
		super(message);
		this.name = "PlayerError";
	}
}

class GameManager {
	private readonly defaultSettings: GameSettings = {
		minPlayers: 5,
		maxPlayers: 20,
		discussionTime: 3 * 60,
		votingTime: 1 * 60,
		roles: {
			WEREWOLF: 1,
			SEER: 1,
			DOCTOR: 0,
			HUNTER: 0,
			WITCH: 0,
			VILLAGER: 3,
		},
	};

	// Role validation mapping
	private readonly validActions: Record<Role, ActionType[]> = {
		WEREWOLF: ["WEREWOLF_KILL"],
		SEER: ["SEER_CHECK"],
		DOCTOR: ["DOCTOR_SAVE"],
		WITCH: ["WITCH_KILL", "WITCH_SAVE"],
		HUNTER: ["HUNTER_SHOOT"],
		VILLAGER: [],
	};

	/**
	 * Generates a random game code
	 */
	private generateGameCode(): string {
		return Array.from({ length: GAME_CODE_LENGTH }, () =>
			GAME_CODE_CHARS.charAt(
				Math.floor(Math.random() * GAME_CODE_CHARS.length),
			),
		).join("");
	}

	/**
	 * Generates a unique game code with retry logic
	 */
	private async generateUniqueGameCode(): Promise<string> {
		for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
			const code = this.generateGameCode();
			const existing = await prisma.game.findUnique({
				where: { code },
				select: { id: true },
			});

			if (!existing) return code;
		}

		throw new GameValidationError(
			"Failed to generate a unique game code after multiple attempts.",
		);
	}

	/**
	 * Validates game settings
	 */
	private validateGameSettings(settings: GameSettings): void {
		if (settings.minPlayers < 3 || settings.minPlayers > 25) {
			throw new GameValidationError("minPlayers must be between 3 and 25");
		}

		if (settings.maxPlayers < settings.minPlayers || settings.maxPlayers > 25) {
			throw new GameValidationError(
				"maxPlayers must be between minPlayers and 25",
			);
		}

		const totalConfiguredRoles = Object.values(settings.roles).reduce(
			(sum, count) => sum + count,
			0,
		);
		if (totalConfiguredRoles > settings.maxPlayers) {
			throw new GameValidationError(
				"Total configured roles exceed maximum players",
			);
		}
	}

	/**
	 * Finds the next available player number
	 */
	private findNextPlayerNumber(existingNumbers: number[]): number {
		const sortedNumbers = existingNumbers.sort((a, b) => a - b);

		for (let i = 1; i <= sortedNumbers.length + 1; i++) {
			if (!sortedNumbers.includes(i)) {
				return i;
			}
		}

		return sortedNumbers.length + 1;
	}

	/**
	 * Shuffles an array in place using Fisher-Yates algorithm
	 */
	private shuffleArray<T>(array: T[]): T[] {
		const shuffled = [...array];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	/**
	 * Assigns roles to players based on configuration
	 */
	private assignRoles(
		playerCount: number,
		roleConfig: Record<Role, number>,
	): Role[] {
		const roles: Role[] = [];

		// Add configured roles
		for (const [role, count] of Object.entries(roleConfig)) {
			for (let i = 0; i < count; i++) {
				roles.push(role as Role);
			}
		}

		// Validate role assignment
		if (roles.length > playerCount) {
			while (roles.length > playerCount) {
				const villagerIndex = roles.lastIndexOf(Role.VILLAGER);
				if (villagerIndex !== -1) {
					roles.splice(villagerIndex, 1);
				} else {
					roles.pop();
				}
			}
		} else {
			while (roles.length < playerCount) {
				roles.push(Role.VILLAGER);
			}
		}

		return this.shuffleArray(roles);
	}

	/**
	 * Creates a new game
	 */
	async createGame(
		hostUserId: string,
		hostNickname: string,
		locale = "en",
		settings?: Partial<GameSettings>,
	): Promise<GameWithRelations> {
		const gameSettings = { ...this.defaultSettings, ...settings };
		this.validateGameSettings(gameSettings);

		const code = await this.generateUniqueGameCode();

		try {
			const game = await prisma.game.create({
				data: {
					code,
					locale,
					settings: gameSettings,
					players: {
						create: {
							userId: hostUserId,
							nickname: hostNickname,
							playerNumber: 1,
							isHost: true,
						},
					},
				},
				include: gameWithRelations.include,
			});

			return game;
		} catch (error) {
			throw new GameValidationError(
				`Failed to create game: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Adds a player to an existing game
	 */
	async joinGame(
		code: string,
		userId: string,
		nickname: string,
	): Promise<GameWithRelations> {
		const game = await this.getGameByCode(code);
		if (!game) throw new GameNotFoundError();

		const existingPlayer = game.players.find(
			(player) => player.userId === userId,
		);
		if (existingPlayer) return game;

		if (game.status !== GameStatus.LOBBY) {
			throw new GameValidationError("Game has already started");
		}

		const settings = game.settings as unknown as GameSettings;
		if (game.players.length >= settings.maxPlayers) {
			throw new GameValidationError("Game is full");
		}

		const playerNumbers = game.players.map((p) => p.playerNumber);
		const nextPlayerNumber = this.findNextPlayerNumber(playerNumbers);

		const newPlayer = await prisma.gamePlayer.create({
			data: {
				gameId: game.id,
				userId,
				nickname,
				playerNumber: nextPlayerNumber,
				isHost: false,
			},
		});

		game.players.push(newPlayer);
		return game;
	}

	/**
	 * Removes a player from a game
	 */
	async leaveGame(
		gameId: string,
		userId: string,
	): Promise<GameWithRelations | null> {
		const game = await this.getGame(gameId);
		if (!game) throw new GameNotFoundError();

		const player = game.players.find((p) => p.userId === userId);
		if (!player) throw new PlayerError("Player not found in game");

		if (game.status !== GameStatus.LOBBY) {
			throw new GameValidationError("Cannot leave game after it has started");
		}

		const remainingPlayers = game.players.filter((p) => p.id !== player.id);

		// Use transaction for data consistency
		return await prisma.$transaction(async (tx) => {
			await tx.gamePlayer.delete({
				where: { id: player.id },
			});

			if (remainingPlayers.length === 0) {
				await tx.game.delete({
					where: { id: game.id },
				});
				return null; // Game deleted
			}

			if (player.isHost) {
				const newHost = remainingPlayers[0];
				await tx.gamePlayer.update({
					where: { id: newHost.id },
					data: { isHost: true },
				});
				newHost.isHost = true;
			}

			// Return updated game
			const updatedGame = await tx.game.findUnique({
				where: { id: game.id },
				include: gameWithRelations.include,
			});

			return updatedGame;
		});
	}

	/**
	 * Starts a game
	 */
	async startGame(gameId: string): Promise<GameWithRelations> {
		const game = await this.getGame(gameId);
		if (!game) throw new GameNotFoundError();

		if (game.status !== GameStatus.LOBBY) {
			throw new GameValidationError("Game has already started");
		}

		const settings = game.settings as unknown as GameSettings;
		if (game.players.length < settings.minPlayers) {
			throw new GameValidationError(
				`Not enough players to start the game (${game.players.length}/${settings.minPlayers})`,
			);
		}

		const assignedRoles = this.assignRoles(game.players.length, settings.roles);

		const updatedGame = await prisma.$transaction(async (tx) => {
			const updatePromises = game.players.map((player, index) =>
				tx.gamePlayer.update({
					where: { id: player.id },
					data: { role: assignedRoles[index] },
				}),
			);

			await Promise.all(updatePromises);

			const updated = await tx.game.update({
				where: { id: game.id },
				data: {
					status: GameStatus.IN_PROGRESS,
					phase: GamePhase.NIGHT,
					startedAt: new Date(),
					dayNumber: 1,
				},
				include: gameWithRelations.include,
			});

			await tx.gameEvent.create({
				data: {
					gameId: updated.id,
					type: EventType.GAME_STARTED,
					phase: GamePhase.NIGHT,
					dayNumber: 1,
					data: {
						playerCount: updated.players.length,
						roles: assignedRoles,
					},
				},
			});

			return updated;
		});

		return updatedGame;
	}

	/**
	 * Validates if an action is allowed for a role
	 */
	validateAction(role: Role, action: ActionType): boolean {
		return this.validActions[role]?.includes(action) ?? false;
	}

	/**
	 * Retrieves a game by ID
	 */
	async getGame(gameId: string): Promise<GameWithRelations | null> {
		return prisma.game.findUnique({
			where: { id: gameId },
			include: gameWithRelations.include,
		});
	}

	/**
	 * Retrieves a game by code
	 */
	async getGameByCode(code: string): Promise<GameWithRelations | null> {
		return prisma.game.findUnique({
			where: { code },
			include: gameWithRelations.include,
		});
	}

	/**
	 * Gets all active games
	 */
	async getActiveGames(): Promise<GameWithRelations[]> {
		return prisma.game.findMany({
			where: {
				status: {
					in: [GameStatus.LOBBY, GameStatus.IN_PROGRESS],
				},
			},
			include: gameWithRelations.include,
		});
	}

	/**
	 * Cleans up abandoned games
	 */
	async cleanupAbandonedGames(maxAgeHours = 24): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

		const result = await prisma.game.deleteMany({
			where: {
				status: GameStatus.LOBBY,
				createdAt: {
					lt: cutoffDate,
				},
			},
		});

		return result.count;
	}

	/**
	 * Gets user's games with pagination
	 */
	async getUserGames(
		userId: string,
		options: { page: number; limit: number; status?: GameStatus },
	): Promise<GameWithRelations[]> {
		const { page, limit, status } = options;

		const whereClause: Prisma.GameWhereInput = {
			players: {
				some: { userId },
			},
		};

		if (status) {
			whereClause.status = status;
		} else {
			whereClause.status = {
				in: [GameStatus.LOBBY, GameStatus.IN_PROGRESS],
			};
		}

		return prisma.game.findMany({
			where: whereClause,
			include: gameWithRelations.include,
			orderBy: {
				createdAt: "desc",
			},
			skip: (page - 1) * limit,
			take: limit,
		});
	}

	/**
	 * Gets count of user's games
	 */
	async getUserGamesCount(
		userId: string,
		status?: GameStatus,
	): Promise<number> {
		const whereClause: Prisma.GameWhereInput = {
			players: {
				some: { userId },
			},
		};

		if (status) {
			whereClause.status = status;
		} else {
			whereClause.status = {
				in: [GameStatus.LOBBY, GameStatus.IN_PROGRESS],
			};
		}

		return prisma.game.count({ where: whereClause });
	}

	/**
	 * Gets user's game statistics
	 */
	async getUserGameStats(userId: string) {
		const [totalGames, completedGames, activeGames] = await Promise.all([
			prisma.game.count({
				where: {
					players: { some: { userId } },
				},
			}),
			prisma.game.count({
				where: {
					players: { some: { userId } },
					status: GameStatus.COMPLETED,
				},
			}),
			prisma.game.count({
				where: {
					players: { some: { userId } },
					status: { in: [GameStatus.LOBBY, GameStatus.IN_PROGRESS] },
				},
			}),
		]);

		return {
			totalGames,
			completedGames,
			activeGames,
			winRate: completedGames > 0 ? 0 : null, // TODO: Calculate win rate based on game results
		};
	}

	/**
	 * Gets count of active games
	 */
	async getActiveGamesCount(): Promise<number> {
		return prisma.game.count({
			where: {
				status: { in: [GameStatus.LOBBY, GameStatus.IN_PROGRESS] },
			},
		});
	}
}

export const gameManager = new GameManager();
