import type { InputJsonValue } from "@prisma/client/runtime/library";
import {
  type ActionResult,
  ActionType,
  type CreateGameInput,
  DEFAULT_GAME_SETTINGS,
  ErrorCode,
  EventType,
  EventVisibility,
  GAME_CODE_CHARS,
  GAME_CODE_LENGTH,
  type GameAction,
  GameError,
  type GameEvent,
  GamePhase,
  type GamePlayer,
  type GameSettings,
  GameStatus,
  type GameWithRelations,
  MessageType,
  type NightActionResults,
  type PhaseEndResult,
  Role,
  type RoleState,
  Side,
  ValidationError,
  type Vote,
  type VoteResult,
  type VoteResults,
  type WinConditionCheck,
} from "@werewolf/shared";
import { logger } from "../../common/utils/logger";
import {
  type PrismaTransactionClient,
  prisma,
} from "../../common/utils/prisma";
import { gameRepository } from "./game.repository";

export class GameService {
  async createGame(
    hostId: string,
    hostNickname: string,
    input: CreateGameInput,
  ) {
    const settings: GameSettings = {
      ...DEFAULT_GAME_SETTINGS,
      ...input.settings,
      nightTime: input.settings?.nightTime || 30,
      roles: {
        ...DEFAULT_GAME_SETTINGS.roles,
        ...input.settings?.roles,
      } as Record<Role, number>,
    };

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

    return game;
  }

  async joinGame(code: string, userId: string, nickname: string) {
    const game = await gameRepository.findByCodeWithRelations(
      code.toUpperCase(),
    );

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    // Check if already in game
    const existingPlayer = game.players.find((p) => p.userId === userId);
    if (existingPlayer) {
      // Handle reconnection
      if (existingPlayer.disconnectedAt) {
        await gameRepository.updatePlayer(existingPlayer.id, {
          disconnectedAt: null,
        });

        await this.createEvent(game.id, {
          type: EventType.PLAYER_RECONNECTED,
          visibility: EventVisibility.PUBLIC,
          data: {
            playerId: existingPlayer.id,
            nickname: existingPlayer.nickname,
          },
        });
      }

      return { game, player: existingPlayer };
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

    // Add player
    const playerNumber = this.findNextPlayerNumber(
      game.players.map((p) => p.playerNumber),
    );

    const newPlayer = await gameRepository.addPlayer(game.id, {
      userId,
      nickname,
      playerNumber,
    });

    // Create join event
    await this.createEvent(game.id, {
      type: EventType.PLAYER_JOINED,
      visibility: EventVisibility.PUBLIC,
      data: { playerId: newPlayer.id, nickname },
    });

    // Fetch updated game
    const updatedGame = await gameRepository.findByIdWithRelations(game.id);
    if (!updatedGame) {
      throw new Error("Failed to fetch updated game");
    }

    logger.info(`Player ${nickname} joined game ${code}`);

    return { game: updatedGame, player: newPlayer };
  }

  async leaveGame(gameId: string, userId: string) {
    const game = await gameRepository.findByIdWithRelations(gameId);

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    const player = game.players.find((p) => p.userId === userId);
    if (!player) {
      throw new GameError(ErrorCode.PLAYER_NOT_FOUND, "Player not in game");
    }

    if (game.status !== GameStatus.LOBBY) {
      throw new ValidationError("Cannot leave game after it has started");
    }

    // Use transaction
    return await prisma.$transaction(async (tx) => {
      await gameRepository.removePlayer(player.id, tx);

      const remainingPlayers = game.players.filter((p) => p.id !== player.id);

      if (remainingPlayers.length === 0) {
        await gameRepository.delete(game.id, tx);
        logger.info(`Game ${game.code} deleted (no players)`);
        return null;
      }

      // Handle host transfer
      if (player.isHost && remainingPlayers.length > 0) {
        const newHost = remainingPlayers[0];
        await gameRepository.updatePlayer(newHost.id, { isHost: true }, tx);

        await this.createEvent(
          game.id,
          {
            type: EventType.HOST_CHANGED,
            visibility: EventVisibility.PUBLIC,
            data: { newHostId: newHost.id, newHostNickname: newHost.nickname },
          },
          tx,
        );
      }

      // Create leave event
      await this.createEvent(
        game.id,
        {
          type: EventType.PLAYER_LEFT,
          visibility: EventVisibility.PUBLIC,
          data: { playerId: player.id, nickname: player.nickname },
        },
        tx,
      );

      const updatedGame = await gameRepository.findByIdWithRelations(
        game.id,
        tx,
      );
      logger.info(`Player ${player.nickname} left game ${game.code}`);

      return updatedGame;
    });
  }

  async startGame(gameId: string, userId: string) {
    const game = await gameRepository.findByIdWithRelations(gameId);

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    const player = game.players.find((p) => p.userId === userId);
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
      // Assign roles to players and create role states
      await Promise.all(
        game.players.map(async (player, index) => {
          await gameRepository.updatePlayer(
            player.id,
            { role: roles[index] },
            tx,
          );

          // Create role state
          await gameRepository.createRoleState(
            {
              gameId: game.id,
              playerId: player.id,
              role: roles[index],
            },
            tx,
          );
        }),
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

      // Create timer
      await gameRepository.createTimer(
        {
          gameId: game.id,
          phase: GamePhase.NIGHT,
          dayNumber: 1,
          duration: settings.nightTime,
        },
        tx,
      );

      // Create game started event
      await this.createEvent(
        game.id,
        {
          type: EventType.GAME_STARTED,
          visibility: EventVisibility.PUBLIC,
          data: {
            playerCount: game.players.length,
            roles: roles.reduce(
              (acc, role) => {
                acc[role] = (acc[role] || 0) + 1;
                return acc;
              },
              {} as Record<Role, number>,
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

  async castVote(
    gameId: string,
    userId: string,
    targetId: string | null,
  ): Promise<VoteResult> {
    const game = await gameRepository.findByIdWithRelations(gameId);
    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    if (game.phase !== GamePhase.VOTING) {
      throw new ValidationError("Not in voting phase");
    }

    const voter = game.players.find((p) => p.userId === userId);
    if (!voter || !voter.isAlive) {
      throw new ValidationError("You cannot vote");
    }

    if (targetId) {
      const target = game.players.find((p) => p.id === targetId);
      if (!target || !target.isAlive) {
        throw new ValidationError("Invalid vote target");
      }
    }

    // Check for existing vote
    const existingVote = game.votes.find(
      (v) =>
        v.voterId === voter.id &&
        v.dayNumber === game.dayNumber &&
        v.phase === game.phase,
    );

    let vote: Vote;
    if (existingVote) {
      // Update existing vote
      vote = (await gameRepository.updateVote(existingVote.id, {
        target: targetId ? { connect: { id: targetId } } : { disconnect: true },
      })) as Vote;
    } else {
      // Create new vote
      vote = (await gameRepository.createVote({
        game: { connect: { id: game.id } },
        voter: { connect: { id: voter.id } },
        target: targetId ? { connect: { id: targetId } } : undefined,
        phase: game.phase,
        dayNumber: game.dayNumber,
        round: 1,
      })) as Vote;
    }

    // Check if all alive players have voted
    const alivePlayers = game.players.filter((p) => p.isAlive);
    const votes = await gameRepository.findVotesForPhase(
      game.id,
      game.phase as GamePhase,
      game.dayNumber,
    );

    return {
      vote,
      allVoted: votes.length === alivePlayers.length,
    };
  }

  async performNightAction(
    gameId: string,
    userId: string,
    action: ActionType,
    targetId: string,
    secondaryTargetId?: string,
  ): Promise<ActionResult> {
    const game = (await gameRepository.findByIdWithRelations(
      gameId,
    )) as GameWithRelations | null;
    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    if (game.phase !== GamePhase.NIGHT) {
      throw new ValidationError("Not in night phase");
    }

    const player = game.players.find((p) => p.userId === userId);
    if (!player || !player.isAlive || !player.role) {
      throw new ValidationError("You cannot perform actions");
    }

    // Validate action for role
    if (!this.isValidActionForRole(player.role as Role, action)) {
      throw new ValidationError("Invalid action for your role");
    }

    // Get role state
    const roleState = game.roleStates.find((rs) => rs.playerId === player.id) as
      | RoleState
      | undefined;
    if (!roleState) {
      throw new ValidationError("Role state not found");
    }

    // Validate action hasn't been used
    this.validateActionAvailable(roleState, action);

    // Validate targets
    const target = game.players.find((p) => p.id === targetId) as
      | GamePlayer
      | undefined;
    if (!target || !target.isAlive) {
      throw new ValidationError("Invalid target");
    }

    if (secondaryTargetId) {
      const secondaryTarget = game.players.find(
        (p) => p.id === secondaryTargetId,
      );
      if (!secondaryTarget || !secondaryTarget.isAlive) {
        throw new ValidationError("Invalid secondary target");
      }
    }

    // Check for existing action this phase
    const existingAction = game.actions.find(
      (a) =>
        a.playerId === player.id &&
        a.dayNumber === game.dayNumber &&
        a.phase === game.phase &&
        !a.processed,
    );

    if (existingAction) {
      throw new ValidationError(
        "You have already performed an action this phase",
      );
    }

    // Create action
    const gameAction = await gameRepository.createAction({
      game: { connect: { id: game.id } },
      player: { connect: { id: player.id } },
      action,
      targetId,
      secondaryTargetId,
      phase: game.phase,
      dayNumber: game.dayNumber,
    });

    // Get action result based on role
    const actionResult = await this.getActionResult(
      player.role as Role,
      action,
      target,
      game,
    );

    // Check if all required night actions are complete
    const allActionsComplete = await this.checkAllNightActionsComplete(game);

    return {
      action: gameAction as GameAction,
      actionResult,
      allActionsComplete,
    };
  }

  async processPhaseEnd(gameId: string): Promise<PhaseEndResult> {
    const game = (await gameRepository.findByIdWithRelations(
      gameId,
    )) as GameWithRelations | null;
    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    const events: GameEvent[] = [];
    let newPhase: GamePhase;
    let dayNumber = game.dayNumber;

    switch (game.phase) {
      case GamePhase.NIGHT: {
        // Process night actions
        const nightResults = await this.processNightActions(game);
        events.push(...nightResults.events);
        newPhase = GamePhase.DISCUSSION;
        break;
      }

      case GamePhase.DISCUSSION: {
        newPhase = GamePhase.VOTING;
        break;
      }

      case GamePhase.VOTING: {
        // Process votes
        const voteResults = await this.processVotes(game);
        events.push(...voteResults.events);
        newPhase = GamePhase.NIGHT;
        dayNumber++;
        break;
      }

      default:
        throw new ValidationError("Invalid phase for processing");
    }

    // Check win conditions
    const winCheck = this.checkWinConditions(game);

    if (winCheck.gameEnded) {
      // Update game status
      await gameRepository.update(game.id, {
        status: GameStatus.COMPLETED,
        phase: GamePhase.GAME_OVER,
        winningSide: winCheck.winningSide,
        endedAt: new Date(),
      });

      // Create game end event
      await this.createEvent(game.id, {
        type: EventType.GAME_ENDED,
        visibility: EventVisibility.PUBLIC,
        data: {
          winningSide: winCheck.winningSide,
          winners: winCheck.winners,
        },
      });

      return {
        newPhase: GamePhase.GAME_OVER,
        dayNumber,
        events,
        gameEnded: true,
        winningSide: winCheck.winningSide,
        winners: winCheck.winners,
      };
    }

    // Update phase
    await gameRepository.update(game.id, {
      phase: newPhase,
      dayNumber,
    });

    // Create phase change event
    await this.createEvent(game.id, {
      type: EventType.PHASE_CHANGED,
      visibility: EventVisibility.PUBLIC,
      data: { newPhase, dayNumber },
    });

    // Create new timer
    const settings = game.settings as unknown as GameSettings;
    const duration =
      newPhase === GamePhase.DISCUSSION
        ? settings.discussionTime
        : newPhase === GamePhase.VOTING
          ? settings.votingTime
          : settings.nightTime;

    await gameRepository.createTimer({
      gameId: game.id,
      phase: newPhase,
      dayNumber,
      duration,
    });

    return {
      newPhase,
      dayNumber,
      events,
      gameEnded: false,
    };
  }

  async sendChatMessage(gameId: string, userId: string, content: string) {
    const game = await gameRepository.findByIdWithRelations(gameId);
    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    const player = game.players.find((p) => p.userId === userId);
    if (!player) {
      throw new GameError(ErrorCode.PLAYER_NOT_FOUND, "Player not in game");
    }

    // Create chat message
    const message = await gameRepository.createChatMessage({
      gameId,
      playerId: player.id,
      content,
      type: MessageType.CHAT,
      isAlive: player.isAlive,
      dayNumber: game.dayNumber,
      phase: game.phase as GamePhase,
    });

    return {
      ...message,
      playerNickname: player.nickname,
    };
  }

  async markPlayerDisconnected(gameId: string, userId: string) {
    const game = await gameRepository.findByIdWithRelations(gameId);
    if (!game) return;

    const player = game.players.find((p) => p.userId === userId);
    if (!player) return;

    await gameRepository.updatePlayer(player.id, {
      disconnectedAt: new Date(),
    });

    await this.createEvent(gameId, {
      type: EventType.PLAYER_DISCONNECTED,
      visibility: EventVisibility.PUBLIC,
      data: { playerId: player.id, nickname: player.nickname },
    });
  }

  async getGameById(gameId: string) {
    return gameRepository.findByIdWithRelations(gameId);
  }

  async getGameInfo(code: string, userId?: string) {
    const game = await gameRepository.findByCodeWithRelations(
      code.toUpperCase(),
    );

    if (!game) {
      throw new GameError(ErrorCode.GAME_NOT_FOUND, "Game not found");
    }

    // Return limited info if user is not in the game
    if (userId) {
      const player = game.players.find((p) => p.userId === userId);
      if (!player && game.status !== GameStatus.COMPLETED) {
        return {
          id: game.id,
          code: game.code,
          status: game.status,
          playerCount: game.players.length,
          maxPlayers: (game.settings as unknown as GameSettings).maxPlayers,
          locale: game.locale,
        };
      }
    }

    return game;
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

  async getUserStats(userId: string) {
    const stats = await gameRepository.getUserStats(userId);
    return stats;
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

  private isValidActionForRole(role: Role, action: ActionType): boolean {
    const validActions: Record<Role, ActionType[]> = {
      [Role.WEREWOLF]: [ActionType.WEREWOLF_KILL],
      [Role.SEER]: [ActionType.SEER_CHECK],
      [Role.DOCTOR]: [ActionType.DOCTOR_SAVE],
      [Role.WITCH]: [ActionType.WITCH_KILL, ActionType.WITCH_SAVE],
      [Role.HUNTER]: [ActionType.HUNTER_SHOOT],
      [Role.CUPID]: [ActionType.CUPID_LINK],
      [Role.VILLAGER]: [],
      [Role.LITTLE_GIRL]: [],
      [Role.THIEF]: [ActionType.THIEF_CHOOSE],
      [Role.SHERIFF]: [ActionType.SHERIFF_REVEAL],
    };

    return validActions[role]?.includes(action) || false;
  }

  private validateActionAvailable(roleState: RoleState, action: ActionType) {
    switch (action) {
      case ActionType.WITCH_SAVE:
        if (roleState.healPotionUsed) {
          throw new ValidationError("Heal potion already used");
        }
        break;
      case ActionType.WITCH_KILL:
        if (roleState.poisonPotionUsed) {
          throw new ValidationError("Poison potion already used");
        }
        break;
      case ActionType.HUNTER_SHOOT:
        if (roleState.hasShot) {
          throw new ValidationError("Hunter has already shot");
        }
        break;
    }
  }

  private async getActionResult(
    role: Role,
    action: ActionType,
    target: GamePlayer,
    game: GameWithRelations,
  ): Promise<Record<string, unknown>> {
    switch (action) {
      case ActionType.SEER_CHECK:
        return {
          targetRole: target.role,
          isWerewolf: target.role === Role.WEREWOLF,
        };

      case ActionType.CUPID_LINK:
        return {
          loversLinked: true,
        };

      default:
        return {};
    }
  }

  private async checkAllNightActionsComplete(
    game: GameWithRelations,
  ): Promise<boolean> {
    const aliveWerewolves = game.players.filter(
      (p) => p.isAlive && p.role === Role.WEREWOLF,
    );
    const werewolfActions = game.actions.filter(
      (a) =>
        a.dayNumber === game.dayNumber &&
        a.phase === GamePhase.NIGHT &&
        a.action === ActionType.WEREWOLF_KILL &&
        !a.processed,
    );

    if (werewolfActions.length === 0 && aliveWerewolves.length > 0) {
      return false;
    }

    // Check other roles that must act
    const requiredRoles = [Role.SEER, Role.DOCTOR];
    for (const role of requiredRoles) {
      const player = game.players.find((p) => p.isAlive && p.role === role);
      if (player) {
        const hasActed = game.actions.some(
          (a) =>
            a.playerId === player.id &&
            a.dayNumber === game.dayNumber &&
            a.phase === GamePhase.NIGHT &&
            !a.processed,
        );
        if (!hasActed) return false;
      }
    }

    return true;
  }

  private async processNightActions(
    game: GameWithRelations,
  ): Promise<NightActionResults> {
    const events: GameEvent[] = [];
    const nightActions = game.actions.filter(
      (a) =>
        a.dayNumber === game.dayNumber &&
        a.phase === GamePhase.NIGHT &&
        !a.processed,
    );

    const killed: string[] = [];
    const saved: string[] = [];

    // Process actions in order
    for (const action of nightActions) {
      switch (action.action) {
        case ActionType.WEREWOLF_KILL:
          if (action.targetId) {
            killed.push(action.targetId);
          }
          break;

        case ActionType.DOCTOR_SAVE:
          if (action.targetId) {
            saved.push(action.targetId);
          }
          break;

        case ActionType.WITCH_SAVE:
          if (action.targetId) {
            saved.push(action.targetId);
            // Update role state
            const roleState = game.roleStates.find(
              (rs) => rs.playerId === action.playerId,
            );
            if (roleState) {
              await gameRepository.updateRoleState(roleState.id, {
                healPotionUsed: true,
              });
            }
          }
          break;

        case ActionType.WITCH_KILL:
          if (action.targetId) {
            killed.push(action.targetId);
            // Update role state
            const roleState = game.roleStates.find(
              (rs) => rs.playerId === action.playerId,
            );
            if (roleState) {
              await gameRepository.updateRoleState(roleState.id, {
                poisonPotionUsed: true,
              });
            }
          }
          break;
      }

      // Mark action as processed
      await gameRepository.updateAction(action.id, { processed: true });
    }

    // Determine who actually dies
    const actuallyKilled = killed.filter((id) => !saved.includes(id));

    // Kill players
    for (const playerId of actuallyKilled) {
      await gameRepository.updatePlayer(playerId, { isAlive: false });

      const player = game.players.find((p) => p.id === playerId);
      if (player) {
        events.push({
          id: `event-${Date.now()}-${Math.random()}`,
          gameId: game.id,
          type: EventType.PLAYER_KILLED,
          visibility: EventVisibility.PUBLIC,
          visibleTo: [],
          data: {
            playerId,
            playerName: player.nickname,
            causeOfDeath: "werewolf",
          },
          dayNumber: game.dayNumber,
          phase: game.phase,
          createdAt: new Date(),
        });

        // Check if killed player was a lover
        const loverPair = await gameRepository.findLoverPair(playerId);
        if (loverPair) {
          // Kill the other lover too
          const otherLoverId =
            loverPair.player1Id === playerId
              ? loverPair.player2Id
              : loverPair.player1Id;

          await gameRepository.updatePlayer(otherLoverId, { isAlive: false });

          const otherLover = game.players.find((p) => p.id === otherLoverId);
          if (otherLover) {
            events.push({
              id: `event-${Date.now()}-${Math.random()}`,
              gameId: game.id,
              type: EventType.PLAYER_KILLED,
              visibility: EventVisibility.PUBLIC,
              visibleTo: [],
              data: {
                playerId: otherLoverId,
                playerName: otherLover.nickname,
                causeOfDeath: "heartbreak",
              },
              dayNumber: game.dayNumber,
              phase: game.phase,
              createdAt: new Date(),
            });
          }
        }
      }
    }

    return { events };
  }

  private async processVotes(game: GameWithRelations): Promise<VoteResults> {
    const events: GameEvent[] = [];
    const votes = game.votes.filter(
      (v) => v.dayNumber === game.dayNumber && v.phase === GamePhase.VOTING,
    );

    // Count votes
    const voteCount = new Map<string, number>();
    for (const vote of votes) {
      if (vote.targetId) {
        voteCount.set(vote.targetId, (voteCount.get(vote.targetId) || 0) + 1);
      }
    }

    // Find player(s) with most votes
    let maxVotes = 0;
    let eliminated: string[] = [];

    for (const [playerId, count] of voteCount) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminated = [playerId];
      } else if (count === maxVotes) {
        eliminated.push(playerId);
      }
    }

    // Handle ties (for now, no one dies on a tie)
    if (eliminated.length === 1 && maxVotes > 0) {
      const playerId = eliminated[0];
      await gameRepository.updatePlayer(playerId, { isAlive: false });

      const player = game.players.find((p) => p.id === playerId);
      if (player) {
        events.push({
          id: `event-${Date.now()}-${Math.random()}`,
          gameId: game.id,
          type: EventType.PLAYER_ELIMINATED,
          visibility: EventVisibility.PUBLIC,
          visibleTo: [],
          data: {
            playerId,
            playerName: player.nickname,
            voteCount: maxVotes,
          },
          dayNumber: game.dayNumber,
          phase: game.phase,
          createdAt: new Date(),
        });

        // Handle special death effects
        if (player.role === Role.HUNTER) {
          const roleState = game.roleStates.find(
            (rs) => rs.playerId === player.id,
          );
          if (roleState && !roleState.hasShot) {
            // Hunter can shoot someone
            events.push({
              id: `event-${Date.now()}-${Math.random()}`,
              gameId: game.id,
              type: EventType.HUNTER_TRIGGERED,
              visibility: EventVisibility.PRIVATE,
              visibleTo: [player.userId],
              data: {
                message: "You can now shoot someone",
              },
              dayNumber: game.dayNumber,
              phase: game.phase,
              createdAt: new Date(),
            });
          }
        }

        // Check for lover death
        const loverPair = await gameRepository.findLoverPair(playerId);
        if (loverPair) {
          const otherLoverId =
            loverPair.player1Id === playerId
              ? loverPair.player2Id
              : loverPair.player1Id;

          await gameRepository.updatePlayer(otherLoverId, { isAlive: false });

          const otherLover = game.players.find((p) => p.id === otherLoverId);
          if (otherLover) {
            events.push({
              id: `event-${Date.now()}-${Math.random()}`,
              gameId: game.id,
              type: EventType.PLAYER_KILLED,
              visibility: EventVisibility.PUBLIC,
              visibleTo: [],
              data: {
                playerId: otherLoverId,
                playerName: otherLover.nickname,
                causeOfDeath: "heartbreak",
              },
              dayNumber: game.dayNumber,
              phase: game.phase,
              createdAt: new Date(),
            });
          }
        }
      }
    }

    return { events };
  }

  private checkWinConditions(game: GameWithRelations): WinConditionCheck {
    const alivePlayers = game.players.filter((p) => p.isAlive);
    const aliveWerewolves = alivePlayers.filter(
      (p) => p.role === Role.WEREWOLF,
    );
    const aliveVillagers = alivePlayers.filter((p) => p.role !== Role.WEREWOLF);

    // Check if all werewolves are dead
    if (aliveWerewolves.length === 0) {
      return {
        gameEnded: true,
        winningSide: Side.VILLAGE,
        winners: aliveVillagers.map((p) => p.userId),
      };
    }

    // Check if werewolves equal or outnumber villagers
    if (aliveWerewolves.length >= aliveVillagers.length) {
      return {
        gameEnded: true,
        winningSide: Side.WEREWOLF,
        winners: aliveWerewolves.map((p) => p.userId),
      };
    }

    // Check for lovers win
    if (alivePlayers.length === 2) {
      const loverPair = game.loverPairs?.[0];
      if (loverPair) {
        const lover1Alive = alivePlayers.some(
          (p) => p.id === loverPair.player1Id,
        );
        const lover2Alive = alivePlayers.some(
          (p) => p.id === loverPair.player2Id,
        );

        if (lover1Alive && lover2Alive) {
          return {
            gameEnded: true,
            winningSide: Side.LOVERS,
            winners: [
              alivePlayers.find((p) => p.id === loverPair.player1Id)?.userId,
              alivePlayers.find((p) => p.id === loverPair.player2Id)?.userId,
            ].filter(Boolean) as string[],
          };
        }
      }
    }

    return { gameEnded: false };
  }

  private async createEvent(
    gameId: string,
    eventData: {
      type: EventType;
      visibility: EventVisibility;
      data: Record<string, unknown>;
      visibleTo?: string[];
    },
    tx?: PrismaTransactionClient,
  ) {
    const game = await gameRepository.findById(gameId);
    if (!game) return;

    await gameRepository.createEvent(
      {
        game: { connect: { id: gameId } },
        type: eventData.type,
        visibility: eventData.visibility,
        visibleTo: eventData.visibleTo || [],
        data: eventData.data as InputJsonValue,
        dayNumber: game.dayNumber,
        phase: game.phase,
      },
      tx,
    );
  }
}

export const gameService = new GameService();
