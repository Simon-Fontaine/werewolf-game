import { ErrorCode } from "@werewolf/shared";
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
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
  });
};

export const rateLimiter = {
  general: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    1000, // 1000 requests
    "Too many requests, please try again later",
  ),

  auth: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 attempts
    "Too many authentication attempts, please try again later",
  ),

  gameCreate: createRateLimiter(
    60 * 60 * 1000, // 1 hour
    10, // 10 games
    "Too many games created, please try again later",
    true,
  ),
};
