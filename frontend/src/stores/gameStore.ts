import axios from "axios";
import {
	type ApiResponse,
	GamePhase,
	type GameSettings,
	type GameState,
	type Player,
	type Role,
	SocketEvent,
} from "shared";
import { create } from "zustand";
import { useAuthStore } from "./authStore";

interface GameStore {
	// Current game state
	gameId: string | null;
	gameCode: string | null;
	players: Player[];
	phase: GamePhase;
	dayNumber: number;
	settings: GameSettings | null;
	isHost: boolean;
	myRole: Role | null;

	// UI state
	isLoading: boolean;
	error: string | null;

	// Actions
	createGame: (settings?: Partial<GameSettings>) => Promise<void>;
	joinGame: (code: string) => Promise<void>;
	leaveGame: () => Promise<void>;
	startGame: () => void;
	updateGameState: (gameState: GameState) => void;
	reset: () => void;
	clearError: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const api = axios.create({
	baseURL: API_URL,
	withCredentials: true,
});

// Add auth interceptor
api.interceptors.request.use((config) => {
	const token = useAuthStore.getState().accessToken;
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

export const useGameStore = create<GameStore>((set, get) => ({
	// Initial state
	gameId: null,
	gameCode: null,
	players: [],
	phase: GamePhase.WAITING,
	dayNumber: 0,
	settings: null,
	isHost: false,
	myRole: null,
	isLoading: false,
	error: null,

	createGame: async (settings) => {
		set({ isLoading: true, error: null });
		try {
			const locale = useAuthStore.getState().user?.locale || "en";
			const response = await api.post<
				ApiResponse<{
					game: GameState;
				}>
			>("/api/games/create", {
				settings,
				locale,
			});

			if (response.data.success && response.data.data) {
				const { game } = response.data.data;
				set({
					gameId: game.id,
					gameCode: game.code,
					players: game.players,
					settings: game.settings,
					isHost: true,
					isLoading: false,
				});
			}
		} catch (error: unknown) {
			const errorMessage = axios.isAxiosError(error)
				? error.response?.data?.error || "Failed to create game"
				: "Failed to create game";
			set({
				error: errorMessage,
				isLoading: false,
			});
			throw error;
		}
	},

	joinGame: async (code: string) => {
		set({ isLoading: true, error: null });
		try {
			const response = await api.post<
				ApiResponse<{
					game: GameState;
					player: Player;
				}>
			>("/api/games/join", { code });

			if (response.data.success && response.data.data) {
				const { game, player } = response.data.data;
				set({
					gameId: game.id,
					gameCode: game.code,
					settings: game.settings,
					isHost: player.isHost,
					isLoading: false,
				});
			}
		} catch (error: unknown) {
			const errorMessage = axios.isAxiosError(error)
				? error.response?.data?.error || "Failed to join game"
				: "Failed to join game";
			set({
				error: errorMessage,
				isLoading: false,
			});
			throw error;
		}
	},

	leaveGame: async () => {
		// Socket will handle the actual leave
		set({
			gameId: null,
			gameCode: null,
			players: [],
			phase: GamePhase.WAITING,
			dayNumber: 0,
			settings: null,
			isHost: false,
			myRole: null,
		});
	},

	startGame: () => {
		// This will be handled by socket
	},

	updateGameState: (gameState) => {
		set({
			players: gameState.players || get().players,
			phase: gameState.phase || get().phase,
			dayNumber: gameState.dayNumber || get().dayNumber,
		});
	},

	reset: () => {
		set({
			gameId: null,
			gameCode: null,
			players: [],
			phase: GamePhase.WAITING,
			dayNumber: 0,
			settings: null,
			isHost: false,
			myRole: null,
			error: null,
		});
	},

	clearError: () => set({ error: null }),
}));
