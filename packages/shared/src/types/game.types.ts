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
  GAME_OVER = "GAME_OVER",
}

export enum Role {
  VILLAGER = "VILLAGER",
  WEREWOLF = "WEREWOLF",
  SEER = "SEER",
  DOCTOR = "DOCTOR",
  HUNTER = "HUNTER",
  WITCH = "WITCH",
  CUPID = "CUPID",
  LITTLE_GIRL = "LITTLE_GIRL",
  THIEF = "THIEF",
  SHERIFF = "SHERIFF",
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
  CUPID_LINK = "CUPID_LINK",
  SHERIFF_REVEAL = "SHERIFF_REVEAL",
  THIEF_CHOOSE = "THIEF_CHOOSE",
}

export enum EventType {
  GAME_STARTED = "GAME_STARTED",
  PHASE_CHANGED = "PHASE_CHANGED",
  PLAYER_KILLED = "PLAYER_KILLED",
  PLAYER_VOTED = "PLAYER_VOTED",
  PLAYER_JOINED = "PLAYER_JOINED",
  HOST_CHANGED = "HOST_CHANGED",
  PLAYER_LEFT = "PLAYER_LEFT",
  PLAYER_ELIMINATED = "PLAYER_ELIMINATED",
  ROLE_REVEALED = "ROLE_REVEALED",
  LOVERS_REVEALED = "LOVERS_REVEALED",
  POTION_USED = "POTION_USED",
  GAME_ENDED = "GAME_ENDED",
  PLAYER_DISCONNECTED = "PLAYER_DISCONNECTED",
  PLAYER_RECONNECTED = "PLAYER_RECONNECTED",
  HUNTER_TRIGGERED = "HUNTER_TRIGGERED",
}

export enum EventVisibility {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
  ROLE = "ROLE",
  DEAD = "DEAD",
}

export enum MessageType {
  CHAT = "CHAT",
  SYSTEM = "SYSTEM",
  DEATH_MESSAGE = "DEATH_MESSAGE",
  ROLE_ACTION = "ROLE_ACTION",
}

export interface RoleState {
  id: string;
  gameId: string;
  playerId: string;
  role: Role;
  healPotionUsed: boolean;
  poisonPotionUsed: boolean;
  hasShot: boolean;
  isLover: boolean;
  customData?: Record<string, unknown>;
}

export interface GameTimer {
  id: string;
  gameId: string;
  phase: GamePhase;
  dayNumber: number;
  startedAt: Date;
  duration: number;
  pausedAt?: Date;
}

export interface LoverPair {
  id: string;
  gameId: string;
  player1Id: string;
  player2Id: string;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  gameId: string;
  playerId: string;
  playerNickname: string;
  content: string;
  type: MessageType;
  isAlive: boolean;
  dayNumber: number;
  phase: GamePhase;
  createdAt: Date;
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  discussionTime: number;
  votingTime: number;
  nightTime: number;
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

export interface PhaseEndResult {
  newPhase: GamePhase;
  dayNumber: number;
  events: GameEvent[];
  gameEnded: boolean;
  winningSide?: Side;
  winners?: string[]; // Player IDs
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
  disconnectedAt?: Date;
  joinedAt: Date;
}

export interface Vote {
  id: string;
  gameId: string;
  voterId: string;
  targetId?: string;
  phase: GamePhase;
  dayNumber: number;
  round: number;
  createdAt: Date;
}

export interface VoteResult {
  vote: Vote;
  allVoted: boolean;
}

export interface ActionResult {
  action: GameAction;
  actionResult?: Record<string, unknown>;
  allActionsComplete: boolean;
}

export interface GameAction {
  id: string;
  gameId: string;
  playerId: string;
  action: ActionType;
  targetId?: string;
  secondaryTargetId?: string;
  phase: GamePhase;
  dayNumber: number;
  processed: boolean;
  result?: Record<string, unknown>;
  createdAt: Date;
}

export interface GameEvent {
  id: string;
  gameId: string;
  type: EventType;
  data: Record<string, unknown>;
  visibility: EventVisibility;
  visibleTo: string[];
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

export interface NightActionResults {
  events: GameEvent[];
}

export interface VoteResults {
  events: GameEvent[];
}

export interface WinConditionCheck {
  gameEnded: boolean;
  winningSide?: Side;
  winners?: string[];
}

export interface GameWithRelations {
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
  players: GamePlayer[];
  events: GameEvent[];
  votes: Vote[];
  actions: GameAction[];
  roleStates: RoleState[];
  timers: GameTimer[];
  loverPairs?: LoverPair[];
}

export interface GameStateForPlayer {
  id: string;
  code: string;
  status: GameStatus;
  phase: GamePhase;
  dayNumber: number;
  settings: GameSettings;
  locale: string;
  currentTimer?: {
    startedAt: Date;
    duration: number;
  };
  players: Array<{
    id: string;
    userId: string;
    nickname: string;
    isHost: boolean;
    isAlive: boolean;
    playerNumber: number;
    isConnected: boolean;
    role?: Role; // Only visible to the player themselves
  }>;
  myRole?: Role;
  myRoleState?: RoleState;
}
