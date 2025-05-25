import { Prisma } from "@prisma/client";
import { AppError, ErrorCode } from "@werewolf/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger";

export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  logger.error(`${req.method} ${req.path} - ${error.message}`);

  // Handle known errors
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      code: ErrorCode.VALIDATION_ERROR,
      details: error.errors,
    });
    return;
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({
        success: false,
        error: "Resource already exists",
        code: ErrorCode.USER_EXISTS,
      });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Resource not found",
        code: ErrorCode.GAME_NOT_FOUND,
      });
      return;
    }
  }

  // Default error
  res.status(500).json({
    success: false,
    error: "Internal server error",
    code: ErrorCode.INTERNAL_ERROR,
  });
}
