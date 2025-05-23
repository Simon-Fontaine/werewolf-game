import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSocket } from "@/hooks/useSocket";
import { type Player, Role } from "@shared/types";
import { SocketEvent } from "@shared/types";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface ActionPanelProps {
	role: Role;
	players: Player[];
}

export function ActionPanel({ role, players }: ActionPanelProps) {
	const t = useTranslations();
	const socket = useSocket();
	const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
	const [hasActed, setHasActed] = useState(false);

	const alivePlayers = players.filter((p) => p.isAlive);

	const handleAction = () => {
		if (!socket || !selectedPlayer || hasActed) return;

		let actionType = "";
		switch (role) {
			case Role.WEREWOLF:
				actionType = "WEREWOLF_KILL";
				break;
			case Role.SEER:
				actionType = "SEER_CHECK";
				break;
			case Role.DOCTOR:
				actionType = "DOCTOR_SAVE";
				break;
			default:
				return;
		}

		socket.emit(SocketEvent.NIGHT_ACTION, {
			action: actionType,
			targetId: selectedPlayer,
		});

		setHasActed(true);
	};

	if (role === Role.VILLAGER) {
		return (
			<Card className="mt-6">
				<CardContent className="p-6 text-center">
					<p className="text-muted-foreground">
						{t("game.messages.villagerNight")}
					</p>
				</CardContent>
			</Card>
		);
	}

	const getActionButton = () => {
		switch (role) {
			case Role.WEREWOLF:
				return t("game.actions.kill");
			case Role.SEER:
				return t("game.actions.check");
			case Role.DOCTOR:
				return t("game.actions.protect");
			default:
				return t("game.actions.use");
		}
	};

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle>{t("game.nightAction")}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					<div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
						{alivePlayers.map((player) => (
							<Button
								key={player.id}
								variant={selectedPlayer === player.id ? "default" : "outline"}
								onClick={() => setSelectedPlayer(player.id)}
								disabled={hasActed}
								size="sm"
							>
								{player.nickname}
							</Button>
						))}
					</div>
					<Button
						onClick={handleAction}
						disabled={!selectedPlayer || hasActed}
						className="w-full"
					>
						{hasActed ? t("game.actionCompleted") : getActionButton()}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
