export interface GameState {
	id: string;
	code: string;
	players: Player[];
	phase: GamePhase;
	dayNumber: number;
}

export interface Player {
	id: string;
	name: string;
	role?: Role;
	isAlive: boolean;
}

export enum GamePhase {
	LOBBY = "LOBBY",
	NIGHT = "NIGHT",
	DISCUSSION = "DISCUSSION",
	VOTING = "VOTING",
}

export enum Role {
	VILLAGER = "VILLAGER",
	WEREWOLF = "WEREWOLF",
	SEER = "SEER",
	DOCTOR = "DOCTOR",
}
