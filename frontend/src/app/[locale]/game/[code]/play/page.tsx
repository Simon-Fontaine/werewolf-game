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
import { GamePhase, type Player, SocketEvent } from "@shared/types";
import axios from "axios";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function GamePlayPage() {
	const t = useTranslations();
	const router = useRouter();
	const params = useParams();
	const gameCode = params.code as string;

	const socket = useSocket();
	const { user, accessToken } = useAuthStore();
	const { phase, myRole, players, dayNumber, updateGameState } = useGameStore();
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const fetchGameData = async () => {
			if (!accessToken || !user) return;

			try {
				const response = await axios.get(
					`${process.env.NEXT_PUBLIC_API_URL}/api/games/${gameCode}`,
					{
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
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

					if (currentPlayer?.role) {
						updateGameState({
							id: game.id,
							code: game.code,
							players: game.players,
							phase: game.phase,
							dayNumber: game.dayNumber,
							settings: game.settings,
						});

						useGameStore.setState({
							myRole: currentPlayer.role,
							isHost: currentPlayer.isHost,
						});
					} else {
						// Player not in game or game not started
						router.push(`/game/${gameCode}`);
					}
				}
			} catch (error) {
				console.error("Failed to fetch game data:", error);
				router.push("/");
			} finally {
				setIsLoading(false);
			}
		};

		if (!user) {
			router.push("/auth/guest");
			return;
		}

		// Always fetch game data
		fetchGameData();

		// Rejoin socket room
		if (socket) {
			socket.emit(SocketEvent.JOIN_GAME, gameCode);
		}
	}, [user, accessToken, gameCode, router, socket, updateGameState]);

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p>{t("common.loading")}</p>
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
