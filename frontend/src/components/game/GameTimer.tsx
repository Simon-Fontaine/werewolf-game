import { Card, CardContent } from "@/components/ui/card";
import { useGameStore } from "@/stores/gameStore";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { GamePhase } from "../../../generated/prisma";

interface GameTimerProps {
	phase: GamePhase;
}

export function GameTimer({ phase }: GameTimerProps) {
	const { settings } = useGameStore();
	const [timeRemaining, setTimeRemaining] = useState(0);

	useEffect(() => {
		if (!settings) return;

		let duration = 0;
		switch (phase) {
			case GamePhase.DISCUSSION:
				duration = settings.discussionTime;
				break;
			case GamePhase.VOTING:
				duration = settings.votingTime;
				break;
			default:
				return;
		}

		setTimeRemaining(duration);

		const interval = setInterval(() => {
			setTimeRemaining((prev) => {
				if (prev <= 1) {
					clearInterval(interval);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(interval);
	}, [phase, settings]);

	if (phase !== GamePhase.DISCUSSION && phase !== GamePhase.VOTING) {
		return null;
	}

	const minutes = Math.floor(timeRemaining / 60);
	const seconds = timeRemaining % 60;

	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-center gap-3">
					<Clock className="h-5 w-5" />
					<div className="text-2xl font-mono">
						{minutes}:{seconds.toString().padStart(2, "0")}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
