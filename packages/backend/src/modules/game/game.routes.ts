import { createGameSchema, joinGameSchema } from "@werewolf/shared";
import { Router } from "express";
import { rateLimiter } from "../../common/middleware/rate-limit.middleware";
import { validate } from "../../common/middleware/validation.middleware";
import { authenticate } from "../auth/auth.middleware";
import { gameController } from "./game.controller";

const router = Router();

// All game routes require authentication
router.use(authenticate);

// Game management
router.post(
  "/create",
  rateLimiter.gameCreate,
  validate(createGameSchema),
  gameController.createGame,
);

router.post("/join", validate(joinGameSchema), gameController.joinGame);

router.post("/:code/leave", gameController.leaveGame);
router.post("/:code/start", gameController.startGame);

// Game info
router.get("/my-games", gameController.getUserGames);
router.get("/:code", gameController.getGame);

export default router;
