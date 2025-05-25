"use client";

import { ActionPanel } from "@/components/game/ActionPanel";
import { GameBoard } from "@/components/game/GameBoard";
import { GameTimer } from "@/components/game/GameTimer";
import { PhaseDisplay } from "@/components/game/PhaseDisplay";
import { RoleCard } from "@/components/game/RoleCard";
import { VotingInterface } from "@/components/game/VotingInterface";
import { useSocket } from "@/hooks/useSocket";
import { requireAuth } from "@/lib/auth-utils";
import { useAuthStore } from "@/stores/authStore";
import { type GameWithRelations, useGameStore } from "@/stores/gameStore";
import { SocketEvent } from "@shared/types";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GamePhase, type GamePlayer } from "../../../../../../generated/prisma";

export default function GamePlayPage() {
	const t = useTranslations();
	const router = useRouter();
	const pathname = usePathname();
	const locale = useLocale();
	const params = useParams();
	const gameCode = params.code as string;

	const socket = useSocket();
	const { user, accessToken } = useAuthStore();
	const { phase, myRole, players, dayNumber, setGameState } = useGameStore();
	const [isInitializing, setIsInitializing] = useState(true);
	const hasInitialized = useRef(false);

	// Initialize game data
	const initializeGame = useCallback(async () => {
		if (!user || !accessToken || hasInitialized.current) {
			return;
		}

		try {
			setIsInitializing(true);
			hasInitialized.current = true;

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
					router.push(`/${locale}/game/${gameCode}`);
					return;
				}

				const currentPlayer = game.players.find(
					(p: GamePlayer) => p.userId === user.id,
				);

				if (!currentPlayer || !currentPlayer.role) {
					router.push(`/${locale}/game/${gameCode}`);
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
			router.push(`/${locale}`);
		} finally {
			setIsInitializing(false);
		}
	}, [user, accessToken, gameCode, router, setGameState, locale]);

	// Check authentication
	useEffect(() => {
		if (!requireAuth(user, router, pathname, locale)) {
			return;
		}

		if (user && accessToken && !hasInitialized.current) {
			initializeGame();
		}
	}, [user, accessToken, initializeGame, router, pathname, locale]);

	// Setup socket connection
	useEffect(() => {
		if (!socket || isInitializing || !user) return;

		// Rejoin game room
		socket.emit(SocketEvent.JOIN_GAME, gameCode);

		// Listen for game updates
		const handleGameUpdate = (data: { game: GameWithRelations }) => {
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
	}, [socket, gameCode, isInitializing, setGameState, user]);

	// Don't render if not authenticated
	if (!user) {
		return null;
	}

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
