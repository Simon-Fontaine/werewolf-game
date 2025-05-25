import { AuthError, ErrorCode, type TokenPayload } from "@werewolf/shared";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import type { AuthRequest } from "./auth.types";

export function authenticate(
  req: Request & AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthError(ErrorCode.UNAUTHORIZED, "Authentication required");
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;

    req.user = {
      userId: payload.userId,
      username: payload.username,
      isGuest: payload.isGuest,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new AuthError(ErrorCode.TOKEN_EXPIRED, "Token expired"));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthError(ErrorCode.UNAUTHORIZED, "Invalid token"));
    } else {
      next(error);
    }
  }
}

export function optionalAuth(
  req: Request & AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;

      req.user = {
        userId: payload.userId,
        username: payload.username,
        isGuest: payload.isGuest,
      };
    }
  } catch (error) {
    // Ignore errors for optional auth
  }
  next();
}
