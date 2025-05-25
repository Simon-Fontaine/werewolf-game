export interface User {
	id: string;
	email?: string;
	username: string;
	isGuest: boolean;
	locale: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

export interface TokenPayload {
	userId: string;
	username: string;
	isGuest: boolean;
}

export interface RegisterRequest {
	email: string;
	username: string;
	password: string;
	locale?: string;
}

export interface LoginRequest {
	username: string;
	password: string;
}

export interface CreateGuestRequest {
	locale?: string;
}

export interface RefreshTokenRequest {
	refreshToken: string;
}

export interface ConvertGuestRequest {
	email: string;
	password: string;
}
