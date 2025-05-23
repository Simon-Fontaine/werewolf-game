import type { ApiResponse } from "@shared/types";
import axios from "axios";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
	id: string;
	username: string;
	email?: string;
	isGuest: boolean;
	locale: string;
}

interface AuthState {
	user: User | null;
	accessToken: string | null;
	refreshToken: string | null;
	isLoading: boolean;
	error: string | null;

	// Actions
	register: (
		email: string,
		username: string,
		password: string,
	) => Promise<void>;
	login: (username: string, password: string) => Promise<void>;
	createGuest: (locale?: string) => Promise<void>;
	logout: () => Promise<void>;
	convertGuest: (email: string, password: string) => Promise<void>;
	refreshAccessToken: () => Promise<void>;
	clearError: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Create axios instance
const api = axios.create({
	baseURL: API_URL,
	withCredentials: true,
});

// Add token to requests
api.interceptors.request.use((config) => {
	const token = useAuthStore.getState().accessToken;
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

// Handle token refresh
api.interceptors.response.use(
	(response) => response,
	async (error) => {
		const originalRequest = error.config;

		if (error.response?.status === 401 && !originalRequest._retry) {
			originalRequest._retry = true;

			try {
				await useAuthStore.getState().refreshAccessToken();
				const token = useAuthStore.getState().accessToken;
				originalRequest.headers.Authorization = `Bearer ${token}`;
				return api(originalRequest);
			} catch (refreshError) {
				useAuthStore.getState().logout();
				return Promise.reject(refreshError);
			}
		}

		return Promise.reject(error);
	},
);

export const useAuthStore = create<AuthState>()(
	persist(
		(set, get) => ({
			user: null,
			accessToken: null,
			refreshToken: null,
			isLoading: false,
			error: null,

			register: async (email, username, password) => {
				set({ isLoading: true, error: null });
				try {
					const response = await api.post<
						ApiResponse<{
							user: User;
							accessToken: string;
							refreshToken: string;
						}>
					>("/api/auth/register", {
						email,
						username,
						password,
					});

					if (response.data.success && response.data.data) {
						const { user, accessToken, refreshToken } = response.data.data;
						set({
							user,
							accessToken,
							refreshToken,
							isLoading: false,
						});
					}
				} catch (error: unknown) {
					const errorMessage = axios.isAxiosError(error)
						? error.response?.data?.error || "Registration failed"
						: "Registration failed";
					set({
						error: errorMessage,
						isLoading: false,
					});
					throw error;
				}
			},

			login: async (username, password) => {
				set({ isLoading: true, error: null });
				try {
					const response = await api.post<
						ApiResponse<{
							user: User;
							accessToken: string;
							refreshToken: string;
						}>
					>("/api/auth/login", {
						username,
						password,
					});

					if (response.data.success && response.data.data) {
						const { user, accessToken, refreshToken } = response.data.data;
						set({
							user,
							accessToken,
							refreshToken,
							isLoading: false,
						});
					}
				} catch (error: unknown) {
					const errorMessage = axios.isAxiosError(error)
						? error.response?.data?.error || "Login failed"
						: "Login failed";
					set({
						error: errorMessage,
						isLoading: false,
					});
					throw error;
				}
			},

			createGuest: async (locale = "en") => {
				set({ isLoading: true, error: null });
				try {
					const response = await api.post<
						ApiResponse<{
							user: User;
							accessToken: string;
							refreshToken: string;
						}>
					>("/api/auth/guest", {
						locale,
					});

					if (response.data.success && response.data.data) {
						const { user, accessToken, refreshToken } = response.data.data;
						set({
							user,
							accessToken,
							refreshToken,
							isLoading: false,
						});
					}
				} catch (error: unknown) {
					const errorMessage = axios.isAxiosError(error)
						? error.response?.data?.error || "Failed to create guest"
						: "Failed to create guest";
					set({
						error: errorMessage,
						isLoading: false,
					});
					throw error;
				}
			},

			logout: async () => {
				const refreshToken = get().refreshToken;
				try {
					await api.post("/api/auth/logout", { refreshToken });
				} catch (error) {
					// Ignore logout errors
				}
				set({
					user: null,
					accessToken: null,
					refreshToken: null,
					error: null,
				});
			},

			convertGuest: async (email, password) => {
				set({ isLoading: true, error: null });
				try {
					const response = await api.post<
						ApiResponse<{
							user: User;
						}>
					>("/api/auth/convert-guest", {
						email,
						password,
					});

					if (response.data.success && response.data.data) {
						const { user } = response.data.data;
						set({
							user,
							isLoading: false,
						});
					}
				} catch (error: unknown) {
					const errorMessage = axios.isAxiosError(error)
						? error.response?.data?.error || "Conversion failed"
						: "Conversion failed";
					set({
						error: errorMessage,
						isLoading: false,
					});
					throw error;
				}
			},

			refreshAccessToken: async () => {
				const refreshToken = get().refreshToken;
				if (!refreshToken) throw new Error("No refresh token");

				const response = await api.post<
					ApiResponse<{
						accessToken: string;
					}>
				>("/api/auth/refresh", {
					refreshToken,
				});

				if (response.data.success && response.data.data) {
					const { accessToken } = response.data.data;
					set({ accessToken });
				}
			},

			clearError: () => set({ error: null }),
		}),
		{
			name: "auth-storage",
			partialize: (state) => ({
				user: state.user,
				accessToken: state.accessToken,
				refreshToken: state.refreshToken,
			}),
		},
	),
);
