import type { Prisma } from "@prisma/client";
import type { GamePhase, GameSettings, GameStatus } from "@werewolf/shared";
import {
  type PrismaTransactionClient,
  prisma,
} from "../../common/utils/prisma";

export class GameRepository {
  private readonly defaultInclude = {
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
  };

  async findById(id: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.findUnique({
      where: { id },
      include: this.defaultInclude,
    });
  }

  async findByCode(code: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.findUnique({
      where: { code },
      include: this.defaultInclude,
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
      include: this.defaultInclude,
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
      include: this.defaultInclude,
    });
  }

  async delete(id: string, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.game.delete({
      where: { id },
    });
  }

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

  async createEvent(
    data: Prisma.GameEventCreateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gameEvent.create({ data });
  }

  async createVote(data: Prisma.VoteCreateInput, tx?: PrismaTransactionClient) {
    const client = tx || prisma;
    return client.vote.create({ data });
  }

  async createAction(
    data: Prisma.GameActionCreateInput,
    tx?: PrismaTransactionClient,
  ) {
    const client = tx || prisma;
    return client.gameAction.create({ data });
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
}

export const gameRepository = new GameRepository();
