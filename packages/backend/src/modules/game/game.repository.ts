import type { Prisma } from "@prisma/client";
import type { DefaultArgs } from "@prisma/client/runtime/library";
import {
  type GamePhase,
  type GameSettings,
  GameStatus,
  type MessageType,
  type Role,
} from "@werewolf/shared";
import {
  type PrismaTransactionClient,
  prisma,
} from "../../common/utils/prisma";

export class GameRepository {
  private readonly gameInclude = {
    players: {
      orderBy: { playerNumber: "asc" as const },
    },
    events: {
      orderBy: { createdAt: "desc" as const },
      take: 20,
    },
    votes: {
      where: { dayNumber: { gte: 0 } },
    },
    actions: {
      where: { processed: false },
    },
    roleStates: true,
    timers: {
      orderBy: { createdAt: "desc" as const },
      take: 1,
    },
    loverPairs: true,
  } as Prisma.GameInclude<DefaultArgs>;

  // Basic CRUD operations
  async findById(id: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.findUnique({
      where: { id },
    });
  }

  async findByIdWithRelations(id: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.findUnique({
      where: { id },
      include: this.gameInclude,
    });
  }

  async findByCode(code: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.findUnique({
      where: { code },
    });
  }

  async findByCodeWithRelations(code: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.findUnique({
      where: { code },
      include: this.gameInclude,
    });
  }

  async create(
    data: {
      code: string;
      locale: string;
      settings: GameSettings;
      hostId: string;
      hostNickname: string;
    },
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.game.create({
      data: {
        code: data.code,
        locale: data.locale,
        settings: data.settings as unknown as Prisma.InputJsonValue,
        players: {
          create: {
            userId: data.hostId,
            nickname: data.hostNickname,
            playerNumber: 1,
            isHost: true,
          },
        },
      },
      include: this.gameInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.GameUpdateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.game.update({
      where: { id },
      data,
      include: this.gameInclude,
    });
  }

  async delete(id: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.delete({
      where: { id },
    });
  }

  // Player operations
  async addPlayer(
    gameId: string,
    data: {
      userId: string;
      nickname: string;
      playerNumber: number;
    },
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gamePlayer.create({
      data: {
        gameId,
        ...data,
      },
    });
  }

  async removePlayer(playerId: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.gamePlayer.delete({
      where: { id: playerId },
    });
  }

  async updatePlayer(
    playerId: string,
    data: Prisma.GamePlayerUpdateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gamePlayer.update({
      where: { id: playerId },
      data,
    });
  }

  // Role state operations
  async createRoleState(
    data: {
      gameId: string;
      playerId: string;
      role: Role;
    },
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.roleState.create({
      data: {
        ...data,
      },
    });
  }

  async updateRoleState(
    id: string,
    data: Prisma.RoleStateUpdateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.roleState.update({
      where: { id },
      data,
    });
  }

  // Event operations
  async createEvent(
    data: Prisma.GameEventCreateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gameEvent.create({ data });
  }

  // Vote operations
  async createVote(data: Prisma.VoteCreateInput, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.vote.create({ data });
  }

  async updateVote(
    id: string,
    data: Prisma.VoteUpdateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.vote.update({
      where: { id },
      data,
    });
  }

  async findVotesForPhase(
    gameId: string,
    phase: GamePhase,
    dayNumber: number,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.vote.findMany({
      where: {
        gameId,
        phase,
        dayNumber,
      },
      include: {
        voter: true,
        target: true,
      },
    });
  }

  // Action operations
  async createAction(
    data: Prisma.GameActionCreateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gameAction.create({ data });
  }

  async updateAction(
    id: string,
    data: Prisma.GameActionUpdateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gameAction.update({
      where: { id },
      data,
    });
  }

  // Timer operations
  async createTimer(
    data: {
      gameId: string;
      phase: GamePhase;
      dayNumber: number;
      duration: number;
    },
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gameTimer.create({
      data,
    });
  }

  // Chat operations
  async createChatMessage(
    data: {
      gameId: string;
      playerId: string;
      content: string;
      type: MessageType;
      isAlive: boolean;
      dayNumber: number;
      phase: GamePhase;
    },
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.chatMessage.create({
      data,
    });
  }

  // Lover operations
  async findLoverPair(playerId: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.loverPair.findFirst({
      where: {
        OR: [{ player1Id: playerId }, { player2Id: playerId }],
      },
    });
  }

  async createLoverPair(
    gameId: string,
    player1Id: string,
    player2Id: string,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.loverPair.create({
      data: {
        gameId,
        player1Id,
        player2Id,
      },
    });
  }

  // Query operations
  async findUserGames(
    userId: string,
    options: {
      page: number;
      limit: number;
      status?: GameStatus;
    },
  ) {
    const skip = (options.page - 1) * options.limit;

    const where: Prisma.GameWhereInput = {
      players: {
        some: { userId },
      },
    };

    if (options.status) {
      where.status = options.status;
    }

    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        include: {
          players: {
            orderBy: { playerNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: options.limit,
      }),
      prisma.game.count({ where }),
    ]);

    return { games, total };
  }

  async checkCodeExists(code: string): Promise<boolean> {
    const game = await prisma.game.findUnique({
      where: { code },
      select: { id: true },
    });
    return !!game;
  }

  async getUserStats(userId: string) {
    const [totalGames, wins, gamesAsWerewolf, gamesAsVillager] =
      await Promise.all([
        // Total games
        prisma.gamePlayer.count({
          where: { userId },
        }),

        // Wins
        prisma.gamePlayer.count({
          where: {
            userId,
            game: {
              status: GameStatus.COMPLETED,
              OR: [
                // Village wins
                {
                  winningSide: "VILLAGE",
                  players: {
                    some: {
                      userId,
                      role: {
                        not: "WEREWOLF",
                      },
                    },
                  },
                },
                // Werewolf wins
                {
                  winningSide: "WEREWOLF",
                  players: {
                    some: {
                      userId,
                      role: "WEREWOLF",
                    },
                  },
                },
                // Lover wins
                {
                  winningSide: "LOVERS",
                  players: {
                    some: {
                      userId,
                      roleState: {
                        isLover: true,
                      },
                    },
                  },
                },
              ],
            },
          },
        }),

        // Games as werewolf
        prisma.gamePlayer.count({
          where: {
            userId,
            role: "WEREWOLF",
          },
        }),

        // Games as villager
        prisma.gamePlayer.count({
          where: {
            userId,
            role: {
              not: "WEREWOLF",
            },
          },
        }),
      ]);

    return {
      totalGames,
      wins,
      winRate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
      gamesAsWerewolf,
      gamesAsVillager,
    };
  }
}

export const gameRepository = new GameRepository();
