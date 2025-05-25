import type {
  CreateGameInput,
  GameStatus,
  JoinGameInput,
} from "@werewolf/shared";
import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../auth/auth.types";
import { gameService } from "./game.service";

export class GameController {
  async createGame(
    req: Request<Record<string, never>, unknown, CreateGameInput> & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new Error("Unauthorized");

      const game = await gameService.createGame(
        req.user.userId,
        req.user.username,
        req.body,
      );

      res.status(201).json({
        success: true,
        data: { game },
      });
    } catch (error) {
      next(error);
    }
  }

  async joinGame(
    req: Request<Record<string, never>, unknown, JoinGameInput> & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new Error("Unauthorized");

      const result = await gameService.joinGame(
        req.body.code,
        req.user.userId,
        req.user.username,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async leaveGame(
    req: Request<{ code: string }> & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new Error("Unauthorized");

      const game = await gameService.getGame(req.params.code);
      const result = await gameService.leaveGame(game.id, req.user.userId);

      res.json({
        success: true,
        data: result ? { game: result } : null,
        message: result ? "Left game successfully" : "Game was deleted",
      });
    } catch (error) {
      next(error);
    }
  }

  async startGame(
    req: Request<{ code: string }> & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new Error("Unauthorized");

      const game = await gameService.getGame(req.params.code);
      const result = await gameService.startGame(game.id, req.user.userId);

      res.json({
        success: true,
        data: { game: result },
      });
    } catch (error) {
      next(error);
    }
  }

  async getGame(
    req: Request<{ code: string }> & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const game = await gameService.getGame(req.params.code, req.user?.userId);

      res.json({
        success: true,
        data: { game },
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserGames(
    req: Request & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new Error("Unauthorized");

      const page = Math.max(1, Number.parseInt(req.query.page as string) || 1);
      const limit = Math.min(
        50,
        Math.max(1, Number.parseInt(req.query.limit as string) || 10),
      );
      const status = req.query.status as GameStatus;

      const result = await gameService.getUserGames(req.user.userId, {
        page,
        limit,
        status,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const gameController = new GameController();
