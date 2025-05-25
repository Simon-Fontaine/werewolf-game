import {
  convertGuestSchema,
  createGuestSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  updateProfileSchema,
} from "@werewolf/shared";
import { Router } from "express";
import { rateLimiter } from "../../common/middleware/rate-limit.middleware";
import { validate } from "../../common/middleware/validation.middleware";
import { authController } from "./auth.controller";
import { authenticate } from "./auth.middleware";

const router = Router();

// Public routes
router.post(
  "/register",
  rateLimiter.auth,
  validate(registerSchema),
  authController.register,
);

router.post(
  "/login",
  rateLimiter.auth,
  validate(loginSchema),
  authController.login,
);

router.post(
  "/guest",
  rateLimiter.auth,
  validate(createGuestSchema),
  authController.createGuest,
);

router.post(
  "/refresh",
  validate(refreshTokenSchema),
  authController.refreshToken,
);

router.post("/logout", authController.logout);

// Protected routes
router.use(authenticate);

router.get("/profile", authController.getProfile);

router.patch(
  "/profile",
  validate(updateProfileSchema),
  authController.updateProfile,
);

router.post(
  "/convert-guest",
  validate(convertGuestSchema),
  authController.convertGuest,
);

router.post("/logout-all", authController.logoutAll);

export default router;
