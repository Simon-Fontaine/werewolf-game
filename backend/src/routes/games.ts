import { Router } from "express";
import {
	createGame,
	getGame,
	getUserGames,
	joinGame,
} from "../controllers/gameController";
import { authenticate } from "../middleware/auth";

const router = Router();

// All game routes require authentication
router.use(authenticate);

router.post("/create", createGame);
router.post("/join", joinGame);
router.get("/my-games", getUserGames);
router.get("/:code", getGame);

export default router;
