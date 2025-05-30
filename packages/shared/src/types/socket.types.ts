import type { GamePlayer, GameStateForPlayer } from "./game.types";

export enum SocketEvent {
  // Connection events
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  CONNECTION_ERROR = "connection-error",
  RECONNECT = "reconnect",

  // Authentication
  AUTHENTICATE = "authenticate",
  AUTHENTICATION_SUCCESS = "authentication-success",
  AUTHENTICATION_FAILED = "authentication-failed",

  // Game lifecycle
  CREATE_GAME = "create-game",
  GAME_CREATED = "game-created",
  JOIN_GAME = "join-game",
  LEAVE_GAME = "leave-game",
  START_GAME = "start-game",
  END_GAME = "end-game",

  // Game state updates
  GAME_UPDATE = "game-update",
  GAME_STARTED = "game-started",
  GAME_ENDED = "game-ended",
  PHASE_CHANGED = "phase-changed",
  GAME_DELETED = "game-deleted",

  // Player events
  HOST_CHANGED = "host-changed",
  PLAYER_JOINED = "player-joined",
  PLAYER_LEFT = "player-left",
  PLAYER_ELIMINATED = "player-eliminated",
  PLAYER_ROLE_REVEALED = "player-role-revealed",
  ROLE_ASSIGNED = "role-assigned",
  PLAYER_DISCONNECTED = "player-disconnected",

  // Game actions
  VOTE = "vote",
  VOTE_CAST = "vote-cast",
  NIGHT_ACTION = "night-action",
  ACTION_PERFORMED = "action-performed",
  ACTION_CONFIRMED = "action-confirmed",

  // Chat system
  SEND_MESSAGE = "send-message",
  RECEIVE_MESSAGE = "receive-message",
  CHAT_MESSAGE = "chat-message",

  // Error handling
  ERROR = "error",
  INVALID_ACTION = "invalid-action",
  GAME_NOT_FOUND = "game-not-found",
  PLAYER_NOT_FOUND = "player-not-found",
}

// Socket event payloads
export interface JoinGamePayload {
  gameCode: string;
}

export interface VotePayload {
  targetId: string | null;
}

export interface NightActionPayload {
  action: string;
  targetId: string;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface GameUpdatePayload {
  game: GameStateForPlayer;
}

export interface RoleAssignedPayload {
  role: string;
  players: GamePlayer[];
}
