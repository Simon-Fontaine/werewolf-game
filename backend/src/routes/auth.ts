import {
	convertGuestToUser,
	createGuest,
	getProfile,
	login,
	logout,
	logoutAll,
	refreshAccessToken,
	register,
	updateProfile,
} from "@/controllers/authController";
import { requiredAuthentication } from "@/middleware/auth";
import { rateLimiter } from "@/middleware/rateLimiter";
import { Router } from "express";

const router = Router();

// Public routes with rate limiting
router.post("/register", rateLimiter.auth, register);

router.post("/login", rateLimiter.auth, login);

router.post("/guest", rateLimiter.guest, createGuest);

router.post("/refresh", rateLimiter.refresh, refreshAccessToken);

router.post("/logout", logout);

// Protected routes
router.use(requiredAuthentication);

router.get("/profile", getProfile);

router.patch("/profile", updateProfile);

router.post("/convert-guest", convertGuestToUser);

router.post("/logout-all", logoutAll);

export default router;
