import {
	type ApiResponse,
	GamePhase,
	type GameSettings,
	type GameState,
	type Player,
	type Role,
	SocketEvent,
} from "@shared/types";
import axios from "axios";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "./authStore";

interface ExtendedPlayer extends Player {
	playerNumber?: number;
}

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
	updateGameState: (gameState: Partial<GameState>) => void;
	setPlayers: (players: Player[]) => void;
	addPlayer: (player: Player) => void;
	removePlayer: (userId: string) => void;
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

export const useGameStore = create<GameStore>()(
	persist(
		(set, get) => ({
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
							phase: game.phase,
							dayNumber: game.dayNumber,
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
							game: {
								id: string;
								code: string;
								status: string;
								settings: GameSettings;
							};
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
				set((state) => ({
					gameId: gameState.id || state.gameId,
					gameCode: gameState.code || state.gameCode,
					players: gameState.players || state.players,
					phase: gameState.phase ?? state.phase,
					dayNumber: gameState.dayNumber ?? state.dayNumber,
					settings: gameState.settings || state.settings,
				}));
			},

			setPlayers: (players) => set({ players }),

			addPlayer: (player) =>
				set((state) => ({
					players: [...state.players, player],
				})),

			removePlayer: (userId) =>
				set((state) => ({
					players: state.players.filter((p) => p.userId !== userId),
				})),

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
		}),
		{
			name: "game-storage",
			partialize: (state) => ({
				gameId: state.gameId,
				gameCode: state.gameCode,
				isHost: state.isHost,
				settings: state.settings,
			}),
		},
	),
);
