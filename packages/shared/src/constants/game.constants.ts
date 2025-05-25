import { type GameSettings, Role } from "../types";

export const DEFAULT_GAME_SETTINGS: GameSettings = {
	minPlayers: 5,
	maxPlayers: 20,
	discussionTime: 180, // 3 minutes
	votingTime: 60, // 1 minute
	roles: {
		[Role.WEREWOLF]: 1,
		[Role.SEER]: 1,
		[Role.DOCTOR]: 0,
		[Role.HUNTER]: 0,
		[Role.WITCH]: 0,
		[Role.VILLAGER]: 3,
	},
};

export const GAME_CODE_LENGTH = 6;
export const GAME_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 25;
export const MIN_DISCUSSION_TIME = 30;
export const MAX_DISCUSSION_TIME = 600;
export const MIN_VOTING_TIME = 30;
export const MAX_VOTING_TIME = 300;

export const REFRESH_TOKEN_EXPIRY_DAYS = 7;
export const GUEST_REFRESH_TOKEN_EXPIRY_DAYS = 30;
export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY = "7d";
