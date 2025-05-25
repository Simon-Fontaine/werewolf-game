export enum GameStatus {
  LOBBY = "LOBBY",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum GamePhase {
  WAITING = "WAITING",
  NIGHT = "NIGHT",
  DISCUSSION = "DISCUSSION",
  VOTING = "VOTING",
  EXECUTION = "EXECUTION",
}

export enum Role {
  VILLAGER = "VILLAGER",
  WEREWOLF = "WEREWOLF",
  SEER = "SEER",
  DOCTOR = "DOCTOR",
  HUNTER = "HUNTER",
  WITCH = "WITCH",
}

export enum Side {
  VILLAGE = "VILLAGE",
  WEREWOLF = "WEREWOLF",
  LOVERS = "LOVERS",
  NONE = "NONE",
}

export enum ActionType {
  WEREWOLF_KILL = "WEREWOLF_KILL",
  SEER_CHECK = "SEER_CHECK",
  DOCTOR_SAVE = "DOCTOR_SAVE",
  WITCH_KILL = "WITCH_KILL",
  WITCH_SAVE = "WITCH_SAVE",
  HUNTER_SHOOT = "HUNTER_SHOOT",
}

export enum EventType {
  GAME_STARTED = "GAME_STARTED",
  PHASE_CHANGED = "PHASE_CHANGED",
  PLAYER_KILLED = "PLAYER_KILLED",
  PLAYER_VOTED = "PLAYER_VOTED",
  PLAYER_ELIMINATED = "PLAYER_ELIMINATED",
  ROLE_REVEALED = "ROLE_REVEALED",
  GAME_ENDED = "GAME_ENDED",
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  discussionTime: number;
  votingTime: number;
  roles: Record<Role, number>;
}

export interface Game {
  id: string;
  code: string;
  status: GameStatus;
  phase: GamePhase;
  dayNumber: number;
  settings: GameSettings;
  locale: string;
  winningSide?: Side;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

export interface GamePlayer {
  id: string;
  gameId: string;
  userId: string;
  playerNumber: number;
  nickname: string;
  role?: Role;
  isAlive: boolean;
  isHost: boolean;
  joinedAt: Date;
}

export interface Vote {
  id: string;
  gameId: string;
  voterId: string;
  targetId?: string;
  phase: GamePhase;
  dayNumber: number;
  createdAt: Date;
}

export interface GameAction {
  id: string;
  gameId: string;
  playerId: string;
  action: ActionType;
  targetId?: string;
  phase: GamePhase;
  dayNumber: number;
  processed: boolean;
  createdAt: Date;
}

export interface GameEvent {
  id: string;
  gameId: string;
  type: EventType;
  data: Record<string, unknown>;
  dayNumber: number;
  phase: GamePhase;
  createdAt: Date;
}

// Request/Response types
export interface CreateGameRequest {
  settings?: Partial<GameSettings>;
  locale?: string;
}

export interface JoinGameRequest {
  code: string;
}

export interface GameStateForPlayer {
  id: string;
  code: string;
  status: GameStatus;
  phase: GamePhase;
  dayNumber: number;
  settings: GameSettings;
  players: Array<{
    id: string;
    userId: string;
    nickname: string;
    isHost: boolean;
    isAlive: boolean;
    playerNumber: number;
    role?: Role;
  }>;
}
