import { prisma } from "@/common/utils/prisma";
import type { GamePlayer, Prisma } from "@prisma/client";
import {
  type ActionType,
  ErrorCode,
  GamePhase,
  Role,
  SocketEvent,
} from "@werewolf/shared";
import { logger } from "../../../common/utils/logger";
import { gameRepository } from "../../game/game.repository";
import { gameService } from "../../game/game.service";
import type { AuthenticatedSocket } from "../socket.types";
import { BaseSocketHandler } from "./base.handler";

export class GameSocketHandler extends BaseSocketHandler {
  handleConnection(socket: AuthenticatedSocket) {
    // Game lifecycle events
    socket.on(SocketEvent.JOIN_GAME, (gameCode: string) =>
      this.handleJoinGame(socket, gameCode),
    );

    socket.on(SocketEvent.LEAVE_GAME, () => this.handleLeaveGame(socket));

    socket.on(SocketEvent.START_GAME, () => this.handleStartGame(socket));

    // Game actions
    socket.on(SocketEvent.VOTE, (data: { targetId: string | null }) =>
      this.handleVote(socket, data),
    );

    socket.on(
      SocketEvent.NIGHT_ACTION,
      (data: { action: ActionType; targetId: string }) =>
        this.handleNightAction(socket, data),
    );

    // Handle disconnect
    socket.on("disconnect", () => this.handleDisconnect(socket));
  }

  private async handleJoinGame(socket: AuthenticatedSocket, gameCode: string) {
    try {
      logger.info(`${socket.username} attempting to join game ${gameCode}`);

      // Get game
      const game = await gameRepository.findByCode(gameCode);
      if (!game) {
        return this.sendError(
          socket,
          "Game not found",
          ErrorCode.GAME_NOT_FOUND,
        );
      }

      // Check if player is in game
      const player = game.players.find(
        (p: GamePlayer) => p.userId === socket.userId,
      );
      if (!player) {
        return this.sendError(
          socket,
          "You are not in this game",
          ErrorCode.NOT_IN_GAME,
        );
      }

      // Join room
      await this.joinRoom(socket, game.id);

      // Send current game state to joining player
      const gameState = this.formatGameState(game, socket.userId);
      socket.emit(SocketEvent.GAME_UPDATE, { game: gameState });

      // Notify others
      this.emitToRoomExcept(
        game.id,
        SocketEvent.PLAYER_JOINED,
        {
          player: {
            id: player.id,
            nickname: player.nickname,
            playerNumber: player.playerNumber,
          },
        },
        socket.id,
      );

      logger.info(`${socket.username} joined game ${gameCode}`);
    } catch (error) {
      logger.error("Error joining game:", error);
      this.sendError(socket, "Failed to join game");
    }
  }

  private async handleLeaveGame(socket: AuthenticatedSocket) {
    try {
      if (!socket.gameId) {
        return this.sendError(socket, "Not in a game");
      }

      const result = await gameService.leaveGame(socket.gameId, socket.userId);

      if (result) {
        // Notify remaining players
        this.emitToRoom(socket.gameId, SocketEvent.GAME_UPDATE, {
          game: this.formatGameState(
            result as unknown as Prisma.GameGetPayload<{
              include: {
                players: true;
              };
            }>,
          ),
        });
      } else {
        // Game was deleted
        this.emitToRoom(socket.gameId, SocketEvent.GAME_DELETED, {});
      }

      // Leave room
      await this.leaveRoom(socket, socket.gameId);

      logger.info(`${socket.username} left game`);
    } catch (error) {
      logger.error("Error leaving game:", error);
      this.sendError(socket, "Failed to leave game");
    }
  }

  private async handleStartGame(socket: AuthenticatedSocket) {
    try {
      if (!socket.gameId) {
        return this.sendError(socket, "Not in a game");
      }

      const game = await gameService.startGame(socket.gameId, socket.userId);

      // Notify all players game has started
      this.emitToRoom(socket.gameId, SocketEvent.GAME_STARTED, {
        game: {
          id: game.id,
          status: game.status,
          phase: game.phase,
          dayNumber: game.dayNumber,
        },
      });

      // Send individual role assignments
      for (const player of game.players) {
        const playerSocket = this.findSocketByUserId(player.userId);
        if (playerSocket) {
          playerSocket.emit(SocketEvent.ROLE_ASSIGNED, {
            role: player.role,
            players: game.players.map((p: GamePlayer) => ({
              id: p.id,
              nickname: p.nickname,
              playerNumber: p.playerNumber,
              isAlive: p.isAlive,
              role: p.userId === player.userId ? p.role : undefined,
            })),
          });
        }
      }

      logger.info(`Game ${socket.gameId} started by ${socket.username}`);
    } catch (error) {
      logger.error("Error starting game:", error);
      this.sendError(
        socket,
        error instanceof Error ? error.message : "Failed to start game",
      );
    }
  }

  private async handleVote(
    socket: AuthenticatedSocket,
    data: { targetId: string | null },
  ) {
    try {
      if (!socket.gameId) {
        return this.sendError(socket, "Not in a game");
      }

      const game = await gameRepository.findById(socket.gameId);
      if (!game) {
        return this.sendError(socket, "Game not found");
      }

      // Validate game phase
      if (game.phase !== GamePhase.VOTING) {
        return this.sendError(socket, "Not in voting phase");
      }

      // Get player
      const player = game.players.find(
        (p: GamePlayer) => p.userId === socket.userId,
      );
      if (!player || !player.isAlive) {
        return this.sendError(socket, "You cannot vote");
      }

      // Validate target
      if (data.targetId) {
        const target = game.players.find(
          (p: GamePlayer) => p.id === data.targetId,
        );
        if (!target || !target.isAlive) {
          return this.sendError(socket, "Invalid vote target");
        }
      }

      // Record vote
      await gameRepository.createVote({
        game: { connect: { id: game.id } },
        voter: { connect: { id: player.id } },
        target: data.targetId ? { connect: { id: data.targetId } } : undefined,
        phase: game.phase,
        dayNumber: game.dayNumber,
      });

      // Notify all players
      this.emitToRoom(socket.gameId, SocketEvent.VOTE_CAST, {
        voterId: player.id,
        voterNickname: player.nickname,
        targetId: data.targetId,
      });

      // Check if all alive players have voted
      const alivePlayers = game.players.filter((p: GamePlayer) => p.isAlive);
      const votes = await gameRepository.findVotesForPhase(
        game.id,
        game.phase as GamePhase,
        game.dayNumber,
      );

      if (votes.length === alivePlayers.length) {
        // Process vote results
        await this.processVoteResults(game.id);
      }

      logger.info(`${socket.username} voted in game ${socket.gameId}`);
    } catch (error) {
      logger.error("Error handling vote:", error);
      this.sendError(socket, "Failed to cast vote");
    }
  }

  private async handleNightAction(
    socket: AuthenticatedSocket,
    data: { action: ActionType; targetId: string },
  ) {
    try {
      if (!socket.gameId) {
        return this.sendError(socket, "Not in a game");
      }

      const game = await gameRepository.findById(socket.gameId);
      if (!game) {
        return this.sendError(socket, "Game not found");
      }

      // Validate game phase
      if (game.phase !== GamePhase.NIGHT) {
        return this.sendError(socket, "Not in night phase");
      }

      // Get player
      const player = game.players.find((p) => p.userId === socket.userId);
      if (!player || !player.isAlive || !player.role) {
        return this.sendError(socket, "You cannot perform actions");
      }

      // Validate action for role
      if (!this.isValidActionForRole(player.role as Role, data.action)) {
        return this.sendError(socket, "Invalid action for your role");
      }

      // Validate target
      const target = game.players.find((p) => p.id === data.targetId);
      if (!target || !target.isAlive) {
        return this.sendError(socket, "Invalid target");
      }

      // Record action
      await gameRepository.createAction({
        game: { connect: { id: game.id } },
        player: { connect: { id: player.id } },
        action: data.action,
        targetId: data.targetId,
        phase: game.phase,
        dayNumber: game.dayNumber,
      });

      // Send confirmation to player
      socket.emit(SocketEvent.ACTION_CONFIRMED, {
        action: data.action,
        targetId: data.targetId,
      });

      logger.info(
        `${socket.username} performed ${data.action} in game ${socket.gameId}`,
      );
    } catch (error) {
      logger.error("Error handling night action:", error);
      this.sendError(socket, "Failed to perform action");
    }
  }

  private async handleDisconnect(socket: AuthenticatedSocket) {
    if (socket.gameId) {
      logger.info(`${socket.username} disconnected from game ${socket.gameId}`);
      // Could implement reconnection logic here
    }
  }

  private formatGameState(
    game: Partial<
      Prisma.GameGetPayload<{
        include: {
          players: true;
        };
      }>
    >,
    viewerId?: string,
  ) {
    return {
      id: game.id,
      code: game.code,
      status: game.status,
      phase: game.phase,
      dayNumber: game.dayNumber,
      settings: game.settings,
      players: game.players?.map((p) => ({
        id: p.id,
        userId: p.userId,
        nickname: p.nickname,
        isHost: p.isHost,
        isAlive: p.isAlive,
        playerNumber: p.playerNumber,
        role: p.userId === viewerId ? p.role : undefined,
      })),
    };
  }

  private findSocketByUserId(userId: string): AuthenticatedSocket | undefined {
    const sockets = this.io.sockets.sockets;
    for (const [, socket] of sockets) {
      const authSocket = socket as AuthenticatedSocket;
      if (authSocket.userId === userId) {
        return authSocket;
      }
    }
    return undefined;
  }

  private isValidActionForRole(role: Role, action: string): boolean {
    const validActions: Record<Role, string[]> = {
      [Role.WEREWOLF]: ["WEREWOLF_KILL"],
      [Role.SEER]: ["SEER_CHECK"],
      [Role.DOCTOR]: ["DOCTOR_SAVE"],
      [Role.WITCH]: ["WITCH_KILL", "WITCH_SAVE"],
      [Role.HUNTER]: ["HUNTER_SHOOT"],
      [Role.VILLAGER]: [],
    };

    return validActions[role]?.includes(action) || false;
  }

  private async processVoteResults(gameId: string) {
    // TODO: Implement vote counting and elimination logic
    logger.info(`Processing vote results for game ${gameId}`);
  }
}

// Add this method to game.repository.ts
export async function findVotesForPhase(
  gameId: string,
  phase: GamePhase,
  dayNumber: number,
) {
  return prisma.vote.findMany({
    where: {
      gameId,
      phase,
      dayNumber,
    },
  });
}
