import type { Game, GamePlayer, Prisma } from "@prisma/client";
import {
  type CreateGameInput,
  DEFAULT_GAME_SETTINGS,
  ErrorCode,
  EventType,
  GAME_CODE_CHARS,
  GAME_CODE_LENGTH,
  GameError,
  GamePhase,
  type GameSettings,
  GameStatus,
  type JoinGameInput,
  Role,
  ValidationError,
} from "@werewolf/shared";
import { logger } from "../../common/utils/logger";
import { prisma } from "../../common/utils/prisma";
import { gameRepository } from "./game.repository";

export class GameService {
  async createGame(
    hostId: string,
    hostNickname: string,
    input: CreateGameInput,
  ) {
    const settings = {
      ...DEFAULT_GAME_SETTINGS,
      ...input.settings,
    } as GameSettings;
    this.validateGameSettings(settings);

    const code = await this.generateUniqueGameCode();

    const game = await gameRepository.create({
      code,
      locale: input.locale || "en",
      settings,
      hostId,
      hostNickname,
    });

    logger.info(`Game created: ${code} by ${hostNickname}`);

    return this.formatGameResponse(game, hostId);
  }

  async joinGame(code: string, userId: string, nickname: string) {
    const game = await gameRepository.findByCode(code.toUpperCase());

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    // Check if already in game
    const existingPlayer = game.players.find(
      (p: GamePlayer) => p.userId === userId,
    );
    if (existingPlayer) {
      return {
        game: this.formatGameResponse(game, userId),
        player: existingPlayer,
      };
    }

    // Validate game state
    if (game.status !== GameStatus.LOBBY) {
      throw new GameError(
        ErrorCode.GAME_ALREADY_STARTED,
        "Game has already started",
      );
    }

    const settings = game.settings as unknown as GameSettings;
    if (game.players.length >= settings.maxPlayers) {
      throw new GameError(ErrorCode.GAME_FULL, "Game is full");
    }

    // Find next player number
    const playerNumbers = game.players.map((p: GamePlayer) => p.playerNumber);
    const nextNumber = this.findNextPlayerNumber(playerNumbers);

    // Add player
    const newPlayer = await gameRepository.addPlayer(game.id, {
      userId,
      nickname,
      playerNumber: nextNumber,
    });

    // Fetch updated game
    const updatedGame = await gameRepository.findById(game.id);
    if (!updatedGame) {
      throw new Error("Failed to fetch updated game");
    }

    logger.info(`Player ${nickname} joined game ${code}`);

    return {
      game: this.formatGameResponse(updatedGame, userId),
      player: newPlayer,
    };
  }

  async leaveGame(gameId: string, userId: string) {
    const game = await gameRepository.findById(gameId);

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    const player = game.players.find((p: GamePlayer) => p.userId === userId);
    if (!player) {
      throw new GameError(ErrorCode.PLAYER_NOT_FOUND, "Player not in game");
    }

    if (game.status !== GameStatus.LOBBY) {
      throw new ValidationError("Cannot leave game after it has started");
    }

    // Use transaction for consistency
    return await prisma.$transaction(async (tx) => {
      // Remove player
      await gameRepository.removePlayer(player.id, tx);

      const remainingPlayers = game.players.filter(
        (p: GamePlayer) => p.id !== player.id,
      );

      // If no players left, delete game
      if (remainingPlayers.length === 0) {
        await gameRepository.delete(game.id, tx);
        logger.info(`Game ${game.code} deleted (no players)`);
        return null;
      }

      // If leaving player was host, assign new host
      if (player.isHost && remainingPlayers.length > 0) {
        const newHost = remainingPlayers[0];
        await gameRepository.updatePlayer(newHost.id, { isHost: true }, tx);
      }

      // Fetch updated game
      const updatedGame = await gameRepository.findById(game.id, tx);
      logger.info(`Player ${player.nickname} left game ${game.code}`);

      return updatedGame ? this.formatGameResponse(updatedGame) : null;
    });
  }

  async startGame(gameId: string, userId: string) {
    const game = await gameRepository.findById(gameId);

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    const player = game.players.find((p: GamePlayer) => p.userId === userId);
    if (!player?.isHost) {
      throw new GameError(
        ErrorCode.NOT_HOST,
        "Only the host can start the game",
      );
    }

    if (game.status !== GameStatus.LOBBY) {
      throw new GameError(
        ErrorCode.GAME_ALREADY_STARTED,
        "Game has already started",
      );
    }

    const settings = game.settings as unknown as GameSettings;
    if (game.players.length < settings.minPlayers) {
      throw new ValidationError(
        `Need at least ${settings.minPlayers} players to start`,
      );
    }

    // Assign roles
    const roles = this.assignRoles(game.players.length, settings.roles);

    // Start game in transaction
    const updatedGame = await prisma.$transaction(async (tx) => {
      // Assign roles to players
      await Promise.all(
        game.players.map((player, index) =>
          gameRepository.updatePlayer(player.id, { role: roles[index] }, tx),
        ),
      );

      // Update game status
      const updated = await gameRepository.update(
        game.id,
        {
          status: GameStatus.IN_PROGRESS,
          phase: GamePhase.NIGHT,
          dayNumber: 1,
          startedAt: new Date(),
        },
        tx,
      );

      // Create game started event
      await gameRepository.createEvent(
        {
          game: { connect: { id: game.id } },
          type: EventType.GAME_STARTED,
          phase: GamePhase.NIGHT,
          dayNumber: 1,
          data: {
            playerCount: game.players.length,
            roles: roles.reduce(
              (acc, role) => {
                acc[role] = (acc[role] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            ),
          },
        },
        tx,
      );

      return updated;
    });

    logger.info(
      `Game ${game.code} started with ${game.players.length} players`,
    );

    return updatedGame;
  }

  async getGame(code: string, userId?: string) {
    const game = await gameRepository.findByCode(code.toUpperCase());

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    return this.formatGameResponse(game, userId);
  }

  async getUserGames(
    userId: string,
    options: {
      page: number;
      limit: number;
      status?: GameStatus;
    },
  ) {
    const { games, total } = await gameRepository.findUserGames(
      userId,
      options,
    );

    return {
      games: games.map((game) => ({
        id: game.id,
        code: game.code,
        status: game.status,
        playerCount: game.players.length,
        isHost: game.players.some((p) => p.userId === userId && p.isHost),
        createdAt: game.createdAt,
      })),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
        hasNext: options.page * options.limit < total,
        hasPrev: options.page > 1,
      },
    };
  }

  // Helper methods
  private validateGameSettings(settings: GameSettings) {
    if (settings.minPlayers < 3 || settings.minPlayers > 25) {
      throw new ValidationError("minPlayers must be between 3 and 25");
    }

    if (settings.maxPlayers < settings.minPlayers || settings.maxPlayers > 25) {
      throw new ValidationError("maxPlayers must be between minPlayers and 25");
    }

    const totalRoles = Object.values(settings.roles).reduce((a, b) => a + b, 0);
    if (totalRoles > settings.maxPlayers) {
      throw new ValidationError("Total roles cannot exceed maxPlayers");
    }
  }

  private async generateUniqueGameCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateGameCode();
      const exists = await gameRepository.checkCodeExists(code);
      if (!exists) return code;
    }
    throw new Error("Failed to generate unique game code");
  }

  private generateGameCode(): string {
    return Array.from({ length: GAME_CODE_LENGTH }, () =>
      GAME_CODE_CHARS.charAt(
        Math.floor(Math.random() * GAME_CODE_CHARS.length),
      ),
    ).join("");
  }

  private findNextPlayerNumber(existingNumbers: number[]): number {
    const sorted = existingNumbers.sort((a, b) => a - b);
    for (let i = 1; i <= sorted.length + 1; i++) {
      if (!sorted.includes(i)) return i;
    }
    return sorted.length + 1;
  }

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

    // Fill remaining with villagers
    while (roles.length < playerCount) {
      roles.push(Role.VILLAGER);
    }

    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return roles;
  }

  private formatGameResponse(
    game: Prisma.GameGetPayload<{
      include: {
        players: true;
      };
    }>,
    viewerId?: string,
  ) {
    return {
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
        role: p.userId === viewerId ? p.role : undefined,
      })),
      createdAt: game.createdAt,
    };
  }
}

export const gameService = new GameService();
