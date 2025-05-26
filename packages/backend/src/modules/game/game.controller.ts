import type { GameStatus } from "@werewolf/shared";
import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../auth/auth.types";
import { gameService } from "./game.service";

export class GameController {
  async getGame(
    req: Request<{ code: string }> & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const game = await gameService.getGameInfo(
        req.params.code,
        req.user?.userId,
      );
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

  async getGameStats(
    req: Request & AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) throw new Error("Unauthorized");

      const stats = await gameService.getUserStats(req.user.userId);

      res.json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const gameController = new GameController();
