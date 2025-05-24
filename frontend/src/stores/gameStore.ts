import {
	type ApiResponse,
	GamePhase,
	type GameSettings,
	type GameState,
	type Player,
	type Role,
} from "@shared/types";
import axios from "axios";
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
	status: string | null;

	// UI state
	isLoading: boolean;
	error: string | null;

	// Actions
	createGame: (settings?: Partial<GameSettings>) => Promise<void>;
	joinGame: (code: string) => Promise<void>;
	setGameState: (state: Partial<GameStore>) => void;
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

const initialState = {
	gameId: null,
	gameCode: null,
	players: [],
	phase: GamePhase.WAITING,
	dayNumber: 0,
	settings: null,
	isHost: false,
	myRole: null,
	status: null,
	isLoading: false,
	error: null,
};

export const useGameStore = create<GameStore>((set) => ({
	...initialState,

	createGame: async (settings) => {
		set({ isLoading: true, error: null });
		try {
			const locale = useAuthStore.getState().user?.locale || "en";
			const response = await api.post<ApiResponse<{ game: GameState }>>(
				"/api/games/create",
				{
					settings,
					locale,
				},
			);

			if (response.data.success && response.data.data) {
				const { game } = response.data.data;
				set({
					gameId: game.id,
					gameCode: game.code,
					players: game.players,
					settings: game.settings,
					phase: game.phase,
					dayNumber: game.dayNumber,
					status: game.status,
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
				ApiResponse<{ game: GameState; player: Player }>
			>("/api/games/join", { code });

			if (response.data.success && response.data.data) {
				const { game, player } = response.data.data;
				set({
					gameId: game.id,
					gameCode: game.code,
					settings: game.settings,
					status: game.status,
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

	setGameState: (state) => set(state),

	reset: () => set(initialState),

	clearError: () => set({ error: null }),
}));
