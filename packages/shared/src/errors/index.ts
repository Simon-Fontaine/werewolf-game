export enum ErrorCode {
	// Auth errors
	UNAUTHORIZED = "UNAUTHORIZED",
	INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
	TOKEN_EXPIRED = "TOKEN_EXPIRED",
	USER_EXISTS = "USER_EXISTS",

	// Game errors
	GAME_NOT_FOUND = "GAME_NOT_FOUND",
	GAME_FULL = "GAME_FULL",
	GAME_ALREADY_STARTED = "GAME_ALREADY_STARTED",
	INVALID_GAME_CODE = "INVALID_GAME_CODE",
	NOT_IN_GAME = "NOT_IN_GAME",
	NOT_HOST = "NOT_HOST",

	// Player errors
	PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND",
	PLAYER_ALREADY_IN_GAME = "PLAYER_ALREADY_IN_GAME",

	// Validation errors
	VALIDATION_ERROR = "VALIDATION_ERROR",
	INVALID_REQUEST = "INVALID_REQUEST",

	// Rate limiting
	RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

	// Server errors
	INTERNAL_ERROR = "INTERNAL_ERROR",
	DATABASE_ERROR = "DATABASE_ERROR",
}

export class AppError extends Error {
	constructor(
		public code: ErrorCode,
		public message: string,
		public statusCode = 500,
		public details?: unknown,
	) {
		super(message);
		this.name = "AppError";
		Object.setPrototypeOf(this, AppError.prototype);
	}
}

export class AuthError extends AppError {
	constructor(code: ErrorCode, message: string) {
		super(code, message, 401);
		this.name = "AuthError";
	}
}

export class ValidationError extends AppError {
	constructor(message: string, details?: unknown) {
		super(ErrorCode.VALIDATION_ERROR, message, 400, details);
		this.name = "ValidationError";
	}
}

export class GameError extends AppError {
	constructor(code: ErrorCode, message: string, statusCode = 400) {
		super(code, message, statusCode);
		this.name = "GameError";
	}
}

export class NotFoundError extends AppError {
	constructor(resource: string) {
		super(ErrorCode.GAME_NOT_FOUND, `${resource} not found`, 404);
		this.name = "NotFoundError";
	}
}
