import { type GameSettings, Role, type RoleDistribution } from "@shared/types";
import {
	type Game,
	type GamePlayer,
	type GameStatus,
	Prisma,
} from "../../generated/prisma";
import { prisma } from "../index";

interface ActiveGame {
	id: string;
	code: string;
	players: Map<string, GamePlayer>;
	settings: GameSettings;
	status: GameStatus;
}

const gameWithPlayers = Prisma.validator<Prisma.GameDefaultArgs>()({
	include: {
		players: {
			include: {
				user: true,
			},
		},
	},
});

type GameWithPlayers = Prisma.GameGetPayload<typeof gameWithPlayers>;

class GameManager {
	private activeGames: Map<string, ActiveGame> = new Map();

	// Generate unique game code
	private generateGameCode(): string {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let code = "";
		for (let i = 0; i < 6; i++) {
			code += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return code;
	}

	async createGame(
		hostUserId: string,
		hostNickname: string,
		locale = "en",
		settings?: Partial<GameSettings>,
	): Promise<Game & { players: GamePlayer[] }> {
		const defaultSettings: GameSettings = {
			minPlayers: 5,
			maxPlayers: 20,
			discussionTime: 180,
			votingTime: 60,
			roles: {
				WEREWOLF: 1,
				SEER: 1,
				DOCTOR: 0,
				HUNTER: 0,
				WITCH: 0,
				VILLAGER: 3,
			},
		};

		const gameSettings = { ...defaultSettings, ...settings };

		// Generate unique code
		let code = this.generateGameCode();
		let attempts = 0;
		while (attempts < 5) {
			const existing = await prisma.game.findUnique({ where: { code } });
			if (!existing) break;
			code = this.generateGameCode();
			attempts++;
		}

		// Create game in database
		const game = await prisma.game.create({
			data: {
				code,
				locale,
				settings: gameSettings as unknown as Prisma.JsonObject,
				players: {
					create: {
						userId: hostUserId,
						nickname: hostNickname,
						playerNumber: 1,
						isHost: true,
					},
				},
			},
			include: {
				players: true,
			},
		});

		// Add to active games
		const activeGame: ActiveGame = {
			id: game.id,
			code: game.code,
			players: new Map([[hostUserId, game.players[0]]]),
			settings: gameSettings,
			status: game.status,
		};
		this.activeGames.set(game.id, activeGame);

		return game;
	}

	async joinGame(
		code: string,
		userId: string,
		nickname: string,
	): Promise<{ game: Game; player: GamePlayer }> {
		// Find game
		const game = await prisma.game.findUnique({
			where: { code },
			include: { players: true },
		});

		if (!game) {
			throw new Error("Game not found");
		}

		if (game.status !== "LOBBY") {
			throw new Error("Game already started");
		}

		// Check if already in game
		const existingPlayer = game.players.find((p) => p.userId === userId);
		if (existingPlayer) {
			return { game, player: existingPlayer };
		}

		// Check if game is full
		const settings = game.settings as unknown as GameSettings;
		if (game.players.length >= settings.maxPlayers) {
			throw new Error("Game is full");
		}

		// Add player
		const playerNumber = game.players.length + 1;
		const player = await prisma.gamePlayer.create({
			data: {
				gameId: game.id,
				userId,
				nickname,
				playerNumber,
				isHost: false,
			},
		});

		// Update active game if exists
		const activeGame = this.activeGames.get(game.id);
		if (activeGame) {
			activeGame.players.set(userId, player);
		}

		return { game, player };
	}

	async leaveGame(gameId: string, userId: string): Promise<void> {
		const game = await prisma.game.findUnique({
			where: { id: gameId },
			include: { players: true },
		});

		if (!game) {
			throw new Error("Game not found");
		}

		const player = game.players.find((p) => p.userId === userId);
		if (!player) {
			throw new Error("Player not in game");
		}

		// If game hasn't started, remove player
		if (game.status === "LOBBY") {
			await prisma.gamePlayer.delete({
				where: { id: player.id },
			});

			// Update active game
			const activeGame = this.activeGames.get(gameId);
			if (activeGame) {
				activeGame.players.delete(userId);
			}

			// If host left, assign new host or cancel game
			if (player.isHost) {
				const remainingPlayers = game.players.filter((p) => p.id !== player.id);
				if (remainingPlayers.length > 0) {
					// Assign new host
					await prisma.gamePlayer.update({
						where: { id: remainingPlayers[0].id },
						data: { isHost: true },
					});
				} else {
					// Cancel game
					await prisma.game.update({
						where: { id: gameId },
						data: { status: "CANCELLED" },
					});
					this.activeGames.delete(gameId);
				}
			}
		} else {
			// TODO: Game in progress - mark player as disconnected or handle differently
			console.log(`Player ${userId} left active game ${gameId}`);
		}
	}

	async startGame(gameId: string): Promise<GameWithPlayers> {
		const game = await this.getGame(gameId);

		if (!game) {
			throw new Error("Game not found");
		}

		if (game.status !== "LOBBY") {
			throw new Error("Game already started");
		}

		const settings = game.settings as unknown as GameSettings;
		if (game.players.length < settings.minPlayers) {
			throw new Error(`Need at least ${settings.minPlayers} players`);
		}

		// Assign roles
		const assignedRoles = this.assignRoles(game.players.length, settings.roles);

		// Shuffle roles
		for (let i = assignedRoles.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[assignedRoles[i], assignedRoles[j]] = [
				assignedRoles[j],
				assignedRoles[i],
			];
		}

		// Update players with roles
		const updatePromises = game.players.map((player, index) =>
			prisma.gamePlayer.update({
				where: { id: player.id },
				data: { role: assignedRoles[index] },
			}),
		);

		await Promise.all(updatePromises);

		// Update game status
		const updatedGame = await prisma.game.update({
			where: { id: gameId },
			data: {
				status: "IN_PROGRESS",
				phase: "NIGHT",
				dayNumber: 1,
				startedAt: new Date(),
			},
			include: {
				players: {
					include: {
						user: true,
					},
				},
			},
		});

		// Create game started event
		await prisma.gameEvent.create({
			data: {
				gameId,
				type: "GAME_STARTED",
				phase: "NIGHT",
				dayNumber: 1,
				data: {
					playerCount: game.players.length,
					roles: assignedRoles,
				},
			},
		});

		return updatedGame;
	}

	private assignRoles(
		playerCount: number,
		roleConfig: RoleDistribution,
	): Role[] {
		const roles: Role[] = [];

		// Add configured roles
		for (const [role, count] of Object.entries(roleConfig)) {
			for (let i = 0; i < count; i++) {
				roles.push(role as Role);
			}
		}

		// Fill remaining slots with villagers
		while (roles.length < playerCount) {
			roles.push(Role.VILLAGER);
		}

		// Remove excess roles if needed (shouldn't happen with proper config)
		while (roles.length > playerCount) {
			const villagerIndex = roles.lastIndexOf(Role.VILLAGER);
			if (villagerIndex !== -1) {
				roles.splice(villagerIndex, 1);
			} else {
				roles.pop();
			}
		}

		return roles;
	}

	async getGame(gameId: string): Promise<GameWithPlayers | null> {
		return prisma.game.findUnique({
			where: { id: gameId },
			include: {
				players: {
					include: {
						user: true,
					},
				},
			},
		});
	}

	async getGameByCode(code: string): Promise<GameWithPlayers | null> {
		return prisma.game.findUnique({
			where: { code },
			include: {
				players: {
					include: {
						user: true,
					},
				},
			},
		});
	}

	getActiveGame(gameId: string): ActiveGame | undefined {
		return this.activeGames.get(gameId);
	}

	isGameActive(gameId: string): boolean {
		return this.activeGames.has(gameId);
	}
}

export const gameManager = new GameManager();
