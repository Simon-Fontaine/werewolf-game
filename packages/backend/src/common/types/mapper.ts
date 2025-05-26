import type {
  Prisma,
  Game as PrismaGame,
  GameAction as PrismaGameAction,
  GameEvent as PrismaGameEvent,
  GamePlayer as PrismaGamePlayer,
  GameTimer as PrismaGameTimer,
  LoverPair as PrismaLoverPair,
  RoleState as PrismaRoleState,
  Vote as PrismaVote,
} from "@prisma/client";

import type {
  Game,
  GameAction,
  GameEvent,
  GamePlayer,
  GameSettings,
  GameStateForPlayer,
  GameTimer,
  LoverPair,
  RoleState,
  Vote,
} from "@werewolf/shared";

export function toGame(prismaGame: PrismaGame): Game {
  return {
    id: prismaGame.id,
    code: prismaGame.code,
    status: prismaGame.status as unknown as Game["status"],
    phase: prismaGame.phase as unknown as Game["phase"],
    dayNumber: prismaGame.dayNumber,
    settings: prismaGame.settings as unknown as GameSettings,
    locale: prismaGame.locale,
    winningSide: prismaGame.winningSide
      ? (prismaGame.winningSide as unknown as Game["winningSide"])
      : undefined,
    startedAt: prismaGame.startedAt || undefined,
    endedAt: prismaGame.endedAt || undefined,
    createdAt: prismaGame.createdAt,
  };
}

export function toGamePlayer(prismaPlayer: PrismaGamePlayer): GamePlayer {
  return {
    id: prismaPlayer.id,
    gameId: prismaPlayer.gameId,
    userId: prismaPlayer.userId,
    playerNumber: prismaPlayer.playerNumber,
    nickname: prismaPlayer.nickname,
    role: prismaPlayer.role
      ? (prismaPlayer.role as unknown as GamePlayer["role"])
      : undefined,
    isAlive: prismaPlayer.isAlive,
    isHost: prismaPlayer.isHost,
    disconnectedAt: prismaPlayer.disconnectedAt || undefined,
    joinedAt: prismaPlayer.joinedAt,
  };
}

export function toGameEvent(prismaEvent: PrismaGameEvent): GameEvent {
  return {
    id: prismaEvent.id,
    gameId: prismaEvent.gameId,
    type: prismaEvent.type as unknown as GameEvent["type"],
    data: prismaEvent.data as Record<string, unknown>,
    visibility: prismaEvent.visibility as unknown as GameEvent["visibility"],
    visibleTo: prismaEvent.visibleTo,
    dayNumber: prismaEvent.dayNumber,
    phase: prismaEvent.phase as unknown as GameEvent["phase"],
    createdAt: prismaEvent.createdAt,
  };
}

export function toVote(prismaVote: PrismaVote): Vote {
  return {
    id: prismaVote.id,
    gameId: prismaVote.gameId,
    voterId: prismaVote.voterId,
    targetId: prismaVote.targetId || undefined,
    phase: prismaVote.phase as unknown as Vote["phase"],
    dayNumber: prismaVote.dayNumber,
    round: prismaVote.round,
    createdAt: prismaVote.createdAt,
  };
}

export function toGameAction(prismaAction: PrismaGameAction): GameAction {
  return {
    id: prismaAction.id,
    gameId: prismaAction.gameId,
    playerId: prismaAction.playerId,
    action: prismaAction.action as unknown as GameAction["action"],
    targetId: prismaAction.targetId || undefined,
    secondaryTargetId: prismaAction.secondaryTargetId || undefined,
    phase: prismaAction.phase as unknown as GameAction["phase"],
    dayNumber: prismaAction.dayNumber,
    processed: prismaAction.processed,
    result: prismaAction.result as Record<string, unknown> | undefined,
    createdAt: prismaAction.createdAt,
  };
}

export function toRoleState(prismaState: PrismaRoleState): RoleState {
  return {
    id: prismaState.id,
    gameId: prismaState.gameId,
    playerId: prismaState.playerId,
    role: prismaState.role as unknown as RoleState["role"],
    healPotionUsed: prismaState.healPotionUsed,
    poisonPotionUsed: prismaState.poisonPotionUsed,
    hasShot: prismaState.hasShot,
    isLover: prismaState.isLover,
    customData: prismaState.customData as Record<string, unknown> | undefined,
  };
}

export function toGameStateForPlayer(
  game: Prisma.GameGetPayload<{
    include: {
      players: true;
      roleStates: true;
      timers: true;
    };
  }>,
  viewerId: string,
): GameStateForPlayer {
  const viewer = game.players.find((p) => p.userId === viewerId);
  const viewerRoleState = game.roleStates.find(
    (rs) => rs.playerId === viewer?.id,
  );

  return {
    id: game.id,
    code: game.code,
    status: game.status as unknown as GameStateForPlayer["status"],
    phase: game.phase as unknown as GameStateForPlayer["phase"],
    dayNumber: game.dayNumber,
    settings: game.settings as unknown as GameSettings,
    locale: game.locale,
    currentTimer: game.timers.find(
      (t) =>
        t.phase === game.phase && t.dayNumber === game.dayNumber && !t.pausedAt,
    )
      ? {
          startedAt: game.timers[0].startedAt,
          duration: game.timers[0].duration,
        }
      : undefined,
    players: game.players.map((p) => ({
      id: p.id,
      userId: p.userId,
      nickname: p.nickname,
      isHost: p.isHost,
      isAlive: p.isAlive,
      playerNumber: p.playerNumber,
      isConnected: !p.disconnectedAt,
      role:
        p.userId === viewerId
          ? (p.role as unknown as GamePlayer["role"])
          : undefined,
    })),
    myRole: viewer?.role
      ? (viewer.role as unknown as GamePlayer["role"])
      : undefined,
    myRoleState: viewerRoleState ? toRoleState(viewerRoleState) : undefined,
  };
}
