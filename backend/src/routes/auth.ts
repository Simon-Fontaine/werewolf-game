import { Router } from "express";
import {
	convertGuestToUser,
	createGuest,
	login,
	logout,
	refreshAccessToken,
	register,
} from "../controllers/authController";
import { authenticate } from "../middleware/auth";

const router = Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/guest", createGuest);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);

// Protected routes
router.post("/convert-guest", authenticate, convertGuestToUser);

export default router;
