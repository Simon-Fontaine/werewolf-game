import {
	createGame,
	getGame,
	getUserGames,
	getUserStats,
	healthCheck,
	joinGame,
	leaveGame,
} from "@/controllers/gameController";
import { requiredAuthentication } from "@/middleware/auth";
import { rateLimiter } from "@/middleware/rateLimiter";
import { Router } from "express";

const router = Router();

// Apply authentication to all routes
router.use(requiredAuthentication);

// Game management routes
router.post("/create", rateLimiter.gameCreate, createGame);

router.post("/join", rateLimiter.gameJoin, joinGame);

router.post("/:code/leave", leaveGame);

// Game information routes
router.get("/my-games", getUserGames);

router.get("/my-stats", getUserStats);

router.get("/:code", getGame);

// Health check (no rate limiting needed)
router.get("/health", healthCheck);

export default router;
