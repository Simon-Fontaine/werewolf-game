"use client";

import { ActionPanel } from "@/components/game/ActionPanel";
import { GameBoard } from "@/components/game/GameBoard";
import { GameTimer } from "@/components/game/GameTimer";
import { PhaseDisplay } from "@/components/game/PhaseDisplay";
import { RoleCard } from "@/components/game/RoleCard";
import { VotingInterface } from "@/components/game/VotingInterface";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/stores/authStore";
import { useGameStore } from "@/stores/gameStore";
import {
	GamePhase,
	type GameState,
	type Player,
	SocketEvent,
} from "@shared/types";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function GamePlayPage() {
	const t = useTranslations();
	const router = useRouter();
	const params = useParams();
	const gameCode = params.code as string;

	const socket = useSocket();
	const { user, accessToken } = useAuthStore();
	const { phase, myRole, players, dayNumber, setGameState } = useGameStore();
	const [isInitializing, setIsInitializing] = useState(true);

	// Initialize game data
	const initializeGame = useCallback(async () => {
		if (!user || !accessToken) {
			router.push("/auth/guest");
			return;
		}

		try {
			setIsInitializing(true);

			// Fetch game data
			const response = await axios.get(
				`${process.env.NEXT_PUBLIC_API_URL}/api/games/${gameCode}`,
				{
					headers: { Authorization: `Bearer ${accessToken}` },
				},
			);

			if (response.data.success && response.data.data) {
				const { game } = response.data.data;

				// Check if game is in progress
				if (game.status !== "IN_PROGRESS") {
					router.push(`/game/${gameCode}`);
					return;
				}

				const currentPlayer = game.players.find(
					(p: Player) => p.userId === user.id,
				);

				if (!currentPlayer || !currentPlayer.role) {
					router.push(`/game/${gameCode}`);
					return;
				}

				// Update game state
				setGameState({
					gameId: game.id,
					gameCode: game.code,
					players: game.players,
					phase: game.phase,
					dayNumber: game.dayNumber,
					settings: game.settings,
					status: game.status,
					myRole: currentPlayer.role,
					isHost: currentPlayer.isHost,
				});
			}
		} catch (error) {
			console.error("Failed to initialize game:", error);
			router.push("/");
		} finally {
			setIsInitializing(false);
		}
	}, [user, accessToken, gameCode, router, setGameState]);

	// Initialize on mount
	useEffect(() => {
		initializeGame();
	}, [initializeGame]);

	// Setup socket connection
	useEffect(() => {
		if (!socket || isInitializing) return;

		// Rejoin game room
		socket.emit(SocketEvent.JOIN_GAME, gameCode);

		// Listen for game updates
		const handleGameUpdate = (data: { game: GameState }) => {
			const { game } = data;
			setGameState({
				players: game.players,
				phase: game.phase,
				dayNumber: game.dayNumber,
				status: game.status,
			});
		};

		socket.on(SocketEvent.GAME_UPDATE, handleGameUpdate);

		return () => {
			socket.off(SocketEvent.GAME_UPDATE, handleGameUpdate);
		};
	}, [socket, gameCode, isInitializing, setGameState]);

	if (isInitializing) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="flex items-center gap-2">
					<Loader2 className="h-4 w-4 animate-spin" />
					<p>{t("common.loading")}</p>
				</div>
			</div>
		);
	}

	if (!myRole) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p>{t("errors.gameNotFound")}</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto p-4 max-w-6xl">
			<div className="grid gap-6 lg:grid-cols-3">
				{/* Left Column - Role and Timer */}
				<div className="space-y-6">
					<RoleCard role={myRole} />
					<GameTimer phase={phase} />
					<PhaseDisplay phase={phase} dayNumber={dayNumber} />
				</div>

				{/* Center Column - Game Board */}
				<div className="lg:col-span-2">
					<GameBoard players={players} currentUserId={user?.id || ""} />

					{/* Action/Voting Panel */}
					{phase === GamePhase.VOTING ? (
						<VotingInterface players={players} />
					) : (
						phase === GamePhase.NIGHT && (
							<ActionPanel role={myRole} players={players} />
						)
					)}
				</div>
			</div>
		</div>
	);
}
