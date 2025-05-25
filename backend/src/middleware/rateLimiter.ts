import type { ApiResponse } from "@shared/types";
import rateLimit from "express-rate-limit";

const createRateLimiter = (
	windowMs: number,
	max: number,
	message: string,
	skipSuccessfulRequests = false,
) => {
	return rateLimit({
		windowMs,
		max,
		message: {
			success: false,
			error: message,
			code: "RATE_LIMIT_EXCEEDED",
		} as ApiResponse,
		standardHeaders: true,
		legacyHeaders: false,
		skipSuccessfulRequests,
	});
};

export const rateLimiter = {
	// Auth routes
	auth: createRateLimiter(
		15 * 60 * 1000, // 15 minutes
		5, // 5 attempts per 15 minutes
		"Too many authentication attempts, please try again later",
	),

	guest: createRateLimiter(
		60 * 60 * 1000, // 1 hour
		10, // 10 guest accounts per hour
		"Too many guest accounts created, please try again later",
	),

	refresh: createRateLimiter(
		15 * 60 * 1000, // 15 minutes
		20, // 20 refresh attempts per 15 minutes
		"Too many token refresh attempts, please try again later",
	),

	// Game routes
	gameCreate: createRateLimiter(
		60 * 60 * 1000, // 1 hour
		10, // 10 games per hour
		"Too many games created, please try again later",
		true, // Don't count successful requests
	),

	gameJoin: createRateLimiter(
		5 * 60 * 1000, // 5 minutes
		20, // 20 join attempts per 5 minutes
		"Too many game join attempts, please try again later",
	),

	// General API rate limiting
	general: createRateLimiter(
		15 * 60 * 1000, // 15 minutes
		1000, // 1000 requests per 15 minutes
		"Too many requests, please try again later",
	),
};
