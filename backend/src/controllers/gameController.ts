import type { ApiResponse } from "@shared/types";
import type { Request, Response } from "express";
import { prisma } from "../index";
import { gameManager } from "../services/gameManager";

export const createGame = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const userId = req.user?.userId;
		const username = req.user?.username;

		if (!userId || !username) {
			res.status(401).json({
				success: false,
				error: "Unauthorized",
			} as ApiResponse);
			return;
		}

		const { settings, locale = "en" } = req.body;

		const game = await gameManager.createGame(
			userId,
			username,
			locale,
			settings,
		);

		res.json({
			success: true,
			data: {
				game: {
					id: game.id,
					code: game.code,
					status: game.status,
					settings: game.settings,
					players: game.players.map((p) => ({
						id: p.id,
						userId: p.userId,
						nickname: p.nickname,
						isHost: p.isHost,
						isAlive: p.isAlive,
					})),
				},
			},
		} as ApiResponse);
	} catch (error) {
		console.error("Create game error:", error);
		res.status(500).json({
			success: false,
			error: "Failed to create game",
		} as ApiResponse);
	}
};

export const joinGame = async (req: Request, res: Response): Promise<void> => {
	try {
		const userId = req.user?.userId;
		const username = req.user?.username;

		if (!userId || !username) {
			res.status(401).json({
				success: false,
				error: "Unauthorized",
			} as ApiResponse);
			return;
		}

		const { code } = req.body;

		if (!code) {
			res.status(400).json({
				success: false,
				error: "Game code is required",
			} as ApiResponse);
			return;
		}

		const { game, player } = await gameManager.joinGame(code, userId, username);

		res.json({
			success: true,
			data: {
				game: {
					id: game.id,
					code: game.code,
					status: game.status,
					settings: game.settings,
				},
				player: {
					id: player.id,
					playerNumber: player.playerNumber,
					isHost: player.isHost,
				},
			},
		} as ApiResponse);
	} catch (error: unknown) {
		console.error("Join game error:", error);
		res.status(400).json({
			success: false,
			error: error instanceof Error ? error.message : "Failed to join game",
		} as ApiResponse);
	}
};

export const getGame = async (req: Request, res: Response): Promise<void> => {
	try {
		const { code } = req.params;

		const game = await gameManager.getGameByCode(code);

		if (!game) {
			res.status(404).json({
				success: false,
				error: "Game not found",
			} as ApiResponse);
			return;
		}

		res.json({
			success: true,
			data: {
				game: {
					id: game.id,
					code: game.code,
					status: game.status,
					phase: game.phase,
					dayNumber: game.dayNumber,
					settings: game.settings,
					players: game.players.map((p) => ({
						id: p.id,
						userId: p.userId,
						nickname: p.nickname,
						isHost: p.isHost,
						isAlive: p.isAlive,
						playerNumber: p.playerNumber,
					})),
				},
			},
		} as ApiResponse);
	} catch (error) {
		console.error("Get game error:", error);
		res.status(500).json({
			success: false,
			error: "Failed to get game",
		} as ApiResponse);
	}
};

export const getUserGames = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const userId = req.user?.userId;

		if (!userId) {
			res.status(401).json({
				success: false,
				error: "Unauthorized",
			} as ApiResponse);
			return;
		}

		const games = await prisma.game.findMany({
			where: {
				players: {
					some: {
						userId,
					},
				},
				status: {
					in: ["LOBBY", "IN_PROGRESS"],
				},
			},
			include: {
				players: true,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		res.json({
			success: true,
			data: {
				games: games.map((game) => ({
					id: game.id,
					code: game.code,
					status: game.status,
					playerCount: game.players.length,
					isHost: game.players.some((p) => p.userId === userId && p.isHost),
					createdAt: game.createdAt,
				})),
			},
		} as ApiResponse);
	} catch (error) {
		console.error("Get user games error:", error);
		res.status(500).json({
			success: false,
			error: "Failed to get games",
		} as ApiResponse);
	}
};
