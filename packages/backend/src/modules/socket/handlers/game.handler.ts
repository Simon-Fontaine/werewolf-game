import {
  type ActionType,
  type CreateGameInput,
  GamePhase,
  type GameSettings,
  GameStatus,
  Role,
  SocketEvent,
} from "@werewolf/shared";
import { toGameStateForPlayer } from "../../../common/types/mapper";
import { logger } from "../../../common/utils/logger";
import { gameService } from "../../game/game.service";
import type { AuthenticatedSocket } from "../socket.types";
import { BaseSocketHandler } from "./base.handler";

export class GameSocketHandler extends BaseSocketHandler {
  handleConnection(socket: AuthenticatedSocket) {
    // Game lifecycle events
    socket.on(SocketEvent.CREATE_GAME, (data: CreateGameInput) =>
      this.handleCreateGame(socket, data),
    );

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
      (data: {
        action: ActionType;
        targetId: string;
        secondaryTargetId?: string;
      }) => this.handleNightAction(socket, data),
    );

    // Chat
    socket.on(SocketEvent.SEND_MESSAGE, (message: string) =>
      this.handleChatMessage(socket, message),
    );

    // Handle disconnect
    socket.on("disconnect", () => this.handleDisconnect(socket));
  }

  private async handleCreateGame(
    socket: AuthenticatedSocket,
    data: CreateGameInput,
  ) {
    try {
      logger.info(`${socket.username} creating new game`);

      const game = await gameService.createGame(
        socket.userId,
        socket.username,
        data,
      );

      // Join the game room
      await this.joinRoom(socket, game.id);

      // Send game state to creator
      socket.emit(SocketEvent.GAME_CREATED, {
        game: toGameStateForPlayer(game, socket.userId),
      });

      logger.info(`Game ${game.code} created by ${socket.username}`);
    } catch (error) {
      logger.error("Error creating game:", error);
      this.sendError(
        socket,
        error instanceof Error ? error.message : "Failed to create game",
      );
    }
  }

  private async handleJoinGame(socket: AuthenticatedSocket, gameCode: string) {
    try {
      logger.info(`${socket.username} attempting to join game ${gameCode}`);

      const result = await gameService.joinGame(
        gameCode,
        socket.userId,
        socket.username,
      );

      // Join room
      await this.joinRoom(socket, result.game.id);

      // Send current game state to joining player
      socket.emit(SocketEvent.GAME_UPDATE, {
        game: toGameStateForPlayer(result.game, socket.userId),
      });

      // Notify others
      this.emitToRoomExcept(
        result.game.id,
        SocketEvent.PLAYER_JOINED,
        {
          player: {
            id: result.player.id,
            nickname: result.player.nickname,
            playerNumber: result.player.playerNumber,
          },
        },
        socket.id,
      );

      logger.info(`${socket.username} joined game ${gameCode}`);
    } catch (error) {
      logger.error("Error joining game:", error);
      this.sendError(
        socket,
        error instanceof Error ? error.message : "Failed to join game",
        error instanceof Error && "code" in error
          ? (error as Error & { code: string }).code
          : undefined,
      );
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
          game: toGameStateForPlayer(result, ""),
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

      // Send individual game states with roles
      for (const player of game.players) {
        const playerSocket = this.findSocketByUserId(player.userId);
        if (playerSocket) {
          const gameState = toGameStateForPlayer(game, player.userId);
          playerSocket.emit(SocketEvent.ROLE_ASSIGNED, {
            game: gameState,
            role: player.role,
          });
        }
      }

      // Start night phase timer
      this.startPhaseTimer(
        game.id,
        GamePhase.NIGHT,
        (game.settings as unknown as GameSettings).nightTime || 30,
      );

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

      const result = await gameService.castVote(
        socket.gameId,
        socket.userId,
        data.targetId,
      );

      // Notify all players
      this.emitToRoom(socket.gameId, SocketEvent.VOTE_CAST, {
        voterId: result.vote.voterId,
        targetId: result.vote.targetId,
        votesComplete: result.allVoted,
      });

      if (result.allVoted) {
        // Process vote results
        await this.processPhaseEnd(socket.gameId);
      }

      logger.info(`${socket.username} voted in game ${socket.gameId}`);
    } catch (error) {
      logger.error("Error handling vote:", error);
      this.sendError(socket, "Failed to cast vote");
    }
  }

  private async handleNightAction(
    socket: AuthenticatedSocket,
    data: {
      action: ActionType;
      targetId: string;
      secondaryTargetId?: string;
    },
  ) {
    try {
      if (!socket.gameId) {
        return this.sendError(socket, "Not in a game");
      }

      const result = await gameService.performNightAction(
        socket.gameId,
        socket.userId,
        data.action,
        data.targetId,
        data.secondaryTargetId,
      );

      // Send confirmation to player
      socket.emit(SocketEvent.ACTION_CONFIRMED, {
        action: data.action,
        targetId: data.targetId,
        result: result.actionResult,
      });

      if (result.allActionsComplete) {
        // Process night results
        await this.processPhaseEnd(socket.gameId);
      }

      logger.info(
        `${socket.username} performed ${data.action} in game ${socket.gameId}`,
      );
    } catch (error) {
      logger.error("Error handling night action:", error);
      this.sendError(
        socket,
        error instanceof Error ? error.message : "Failed to perform action",
      );
    }
  }

  private async handleChatMessage(
    socket: AuthenticatedSocket,
    message: string,
  ) {
    try {
      if (!socket.gameId) {
        return this.sendError(socket, "Not in a game");
      }

      const chatMessage = await gameService.sendChatMessage(
        socket.gameId,
        socket.userId,
        message,
      );

      // Emit to appropriate players based on game state
      const game = await gameService.getGameById(socket.gameId);
      if (!game) return;

      const player = game.players.find((p) => p.userId === socket.userId);
      if (!player) return;

      // Dead players can only talk to other dead players
      if (!player.isAlive) {
        const deadPlayers = game.players.filter((p) => !p.isAlive);
        for (const deadPlayer of deadPlayers) {
          const deadSocket = this.findSocketByUserId(deadPlayer.userId);
          if (deadSocket) {
            deadSocket.emit(SocketEvent.CHAT_MESSAGE, {
              message: chatMessage,
              isDeadChat: true,
            });
          }
        }
      } else {
        // Alive players talk to all alive players
        this.emitToRoom(socket.gameId, SocketEvent.CHAT_MESSAGE, {
          message: chatMessage,
          isDeadChat: false,
        });
      }
    } catch (error) {
      logger.error("Error handling chat message:", error);
      this.sendError(socket, "Failed to send message");
    }
  }

  private async handleDisconnect(socket: AuthenticatedSocket) {
    if (socket.gameId) {
      logger.info(`${socket.username} disconnected from game ${socket.gameId}`);

      try {
        // Mark player as disconnected
        await gameService.markPlayerDisconnected(socket.gameId, socket.userId);

        // Notify other players
        this.emitToRoomExcept(
          socket.gameId,
          SocketEvent.PLAYER_DISCONNECTED,
          {
            userId: socket.userId,
            nickname: socket.username,
          },
          socket.id,
        );
      } catch (error) {
        logger.error("Error handling disconnect:", error);
      }
    }
  }

  private async processPhaseEnd(gameId: string) {
    try {
      const result = await gameService.processPhaseEnd(gameId);

      // Emit phase change to all players
      this.emitToRoom(gameId, SocketEvent.PHASE_CHANGED, {
        newPhase: result.newPhase,
        dayNumber: result.dayNumber,
        events: result.events,
      });

      // Send updated game state to each player
      const game = await gameService.getGameById(gameId);
      if (!game) return;

      for (const player of game.players) {
        const playerSocket = this.findSocketByUserId(player.userId);
        if (playerSocket) {
          const gameState = toGameStateForPlayer(game, player.userId);
          playerSocket.emit(SocketEvent.GAME_UPDATE, { game: gameState });
        }
      }

      // Check for game end
      if (result.gameEnded) {
        this.emitToRoom(gameId, SocketEvent.GAME_ENDED, {
          winningSide: result.winningSide,
          winners: result.winners,
        });
      } else {
        // Start timer for next phase
        const settings = game.settings as unknown as GameSettings;
        const duration =
          result.newPhase === GamePhase.DISCUSSION
            ? settings.discussionTime
            : result.newPhase === GamePhase.VOTING
              ? settings.votingTime
              : settings.nightTime || 30;

        this.startPhaseTimer(gameId, result.newPhase, duration);
      }
    } catch (error) {
      logger.error("Error processing phase end:", error);
    }
  }

  private startPhaseTimer(gameId: string, phase: GamePhase, duration: number) {
    // Emit timer start
    this.emitToRoom(gameId, "timer-started", {
      phase,
      duration,
      startedAt: new Date(),
    });

    // Set timeout to auto-advance phase
    setTimeout(async () => {
      try {
        const game = await gameService.getGameById(gameId);
        if (
          game &&
          game.phase === phase &&
          game.status === GameStatus.IN_PROGRESS
        ) {
          await this.processPhaseEnd(gameId);
        }
      } catch (error) {
        logger.error("Error in phase timer:", error);
      }
    }, duration * 1000);
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
}
