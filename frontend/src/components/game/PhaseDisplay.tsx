import { Card, CardContent } from "@/components/ui/card";
import { Gavel, MessageSquare, Moon, Sun, Vote } from "lucide-react";
import { useTranslations } from "next-intl";
import { GamePhase } from "../../../generated/prisma";

interface PhaseDisplayProps {
	phase: GamePhase;
	dayNumber: number;
}

export function PhaseDisplay({ phase, dayNumber }: PhaseDisplayProps) {
	const t = useTranslations();

	const getPhaseIcon = () => {
		switch (phase) {
			case GamePhase.NIGHT:
				return <Moon className="h-5 w-5" />;
			case GamePhase.DISCUSSION:
				return <MessageSquare className="h-5 w-5" />;
			case GamePhase.VOTING:
				return <Vote className="h-5 w-5" />;
			case GamePhase.EXECUTION:
				return <Gavel className="h-5 w-5" />;
			default:
				return <Sun className="h-5 w-5" />;
		}
	};

	const getPhaseMessage = () => {
		switch (phase) {
			case GamePhase.NIGHT:
				return t("game.messages.nightFalls");
			case GamePhase.DISCUSSION:
				return t("game.messages.discussionTime");
			case GamePhase.VOTING:
				return t("game.messages.votingTime");
			default:
				return "";
		}
	};

	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-center gap-3">
					{getPhaseIcon()}
					<div className="flex-1">
						<p className="font-semibold">
							{t(`game.phases.${phase.toLowerCase()}`)} - Day {dayNumber}
						</p>
						<p className="text-sm text-muted-foreground">{getPhaseMessage()}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
