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
import { GamePhase, Role, SocketEvent } from "@shared/types";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GamePlayPage() {
	const t = useTranslations();
	const router = useRouter();
	const params = useParams();
	const gameCode = params.code as string;

	const socket = useSocket();
	const { user } = useAuthStore();
	const { phase, myRole, players } = useGameStore();

	useEffect(() => {
		if (!user || !myRole) {
			router.push(`/game/${gameCode}`);
			return;
		}
	}, [user, myRole, router, gameCode]);

	if (!myRole) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p>{t("common.loading")}</p>
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
					<PhaseDisplay phase={phase} dayNumber={1} />
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
