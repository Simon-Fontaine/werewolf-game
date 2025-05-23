export interface GameState {
	id: string;
	code: string;
	players: Player[];
	phase: GamePhase;
	dayNumber: number;
	settings: GameSettings;
}

export interface Player {
	id: string;
	userId: string;
	nickname: string;
	role?: Role;
	isAlive: boolean;
	isHost: boolean;
}

export interface GameSettings {
	minPlayers: number;
	maxPlayers: number;
	discussionTime: number;
	votingTime: number;
	roles: RoleDistribution;
}

export interface RoleDistribution {
	[key: string]: number;
}

// Enums
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
}

// Socket events
export enum SocketEvent {
	// Connection
	CONNECT = "connect",
	DISCONNECT = "disconnect",

	// Game
	CREATE_GAME = "create-game",
	JOIN_GAME = "join-game",
	LEAVE_GAME = "leave-game",
	START_GAME = "start-game",

	// Game updates
	GAME_UPDATE = "game-update",
	PLAYER_JOINED = "player-joined",
	PLAYER_LEFT = "player-left",
	GAME_STARTED = "game-started",

	// Actions
	VOTE = "vote",
	NIGHT_ACTION = "night-action",

	// Chat
	SEND_MESSAGE = "send-message",
	RECEIVE_MESSAGE = "receive-message",
}

// API types
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface CreateGameRequest {
	hostName: string;
	settings?: Partial<GameSettings>;
}

export interface JoinGameRequest {
	code: string;
	playerName: string;
}
