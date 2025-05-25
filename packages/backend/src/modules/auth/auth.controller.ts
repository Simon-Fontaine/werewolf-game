import type {
  ConvertGuestInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  UpdateProfileInput,
} from "@werewolf/shared";
import type { NextFunction, Request, Response } from "express";
import { authService } from "./auth.service";
import type { AuthRequest } from "./auth.types";

export class AuthController {
  async register(
    req: Request<Record<string, never>, unknown, RegisterInput>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(
    req: Request<Record<string, never>, unknown, LoginInput>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const result = await authService.login(req.body);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async createGuest(
    req: Request<Record<string, never>, unknown, { locale?: string }>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const locale = req.body.locale || "en";
      const result = await authService.createGuest(locale);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(
    req: Request<Record<string, never>, unknown, RefreshTokenInput>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const result = await authService.refreshAccessToken(
        req.body.refreshToken,
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(
    req: Request<Record<string, never>, unknown, { refreshToken?: string }>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      await authService.logout(req.body.refreshToken);
      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error("Unauthorized");
      }
      await authService.logoutAll(req.user.userId);
      res.json({
        success: true,
        message: "Logged out from all devices",
      });
    } catch (error) {
      next(error);
    }
  }

  async convertGuest(
    req: Request<Record<string, never>, unknown, ConvertGuestInput> &
      AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new Error("Unauthorized");
      }
      const user = await authService.convertGuestToUser(
        req.user.userId,
        req.body.email,
        req.body.password,
      );
      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new Error("Unauthorized");
      }
      const user = await authService.getProfile(req.user.userId);
      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(
    req: Request<Record<string, never>, unknown, UpdateProfileInput> &
      AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        throw new Error("Unauthorized");
      }
      const user = await authService.updateProfile(
        req.user.userId,
        req.body.locale || "en",
      );
      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
