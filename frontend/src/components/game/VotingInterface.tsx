import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSocket } from "@/hooks/useSocket";
import { SocketEvent } from "@shared/types";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { GamePlayer } from "../../../generated/prisma";

interface VotingInterfaceProps {
	players: GamePlayer[];
}

export function VotingInterface({ players }: VotingInterfaceProps) {
	const t = useTranslations();
	const socket = useSocket();
	const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
	const [hasVoted, setHasVoted] = useState(false);

	const alivePlayers = players.filter((p) => p.isAlive);

	const handleVote = () => {
		if (!socket || hasVoted) return;

		socket.emit(SocketEvent.VOTE, {
			targetId: selectedPlayer, // null means skip vote
		});

		setHasVoted(true);
	};

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle>{t("game.voting.title")}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					<div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
						{alivePlayers.map((player) => (
							<Button
								key={player.id}
								variant={selectedPlayer === player.id ? "default" : "outline"}
								onClick={() => setSelectedPlayer(player.id)}
								disabled={hasVoted}
								size="sm"
							>
								{player.nickname}
							</Button>
						))}
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => {
								setSelectedPlayer(null);
								handleVote();
							}}
							disabled={hasVoted}
							className="flex-1"
						>
							{t("game.actions.skip")}
						</Button>
						<Button
							onClick={handleVote}
							disabled={!selectedPlayer || hasVoted}
							className="flex-1"
						>
							{hasVoted ? t("game.voteCast") : t("game.actions.vote")}
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
