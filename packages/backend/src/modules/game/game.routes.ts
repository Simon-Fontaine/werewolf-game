import { Router } from "express";
import { authenticate } from "../auth/auth.middleware";
import { gameController } from "./game.controller";

const router = Router();

// All game routes require authentication
router.use(authenticate);

router.get("/my-games", gameController.getUserGames);
router.get("/stats", gameController.getGameStats);
router.get("/:code", gameController.getGame);

export default router;
