import { Card } from "@/components/ui/card";
import type { Player } from "@shared/types";
import { Skull, User } from "lucide-react";

interface GameBoardProps {
	players: Player[];
	currentUserId: string;
}

export function GameBoard({ players, currentUserId }: GameBoardProps) {
	return (
		<div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
			{players.map((player) => (
				<Card
					key={player.id}
					className={`p-4 text-center transition-all ${
						!player.isAlive ? "opacity-50" : ""
					} ${player.userId === currentUserId ? "ring-2 ring-primary" : ""}`}
				>
					<div className="flex flex-col items-center gap-2">
						{player.isAlive ? (
							<User className="h-8 w-8" />
						) : (
							<Skull className="h-8 w-8 text-destructive" />
						)}
						<span className="font-medium text-sm">{player.nickname}</span>
						{!player.isAlive && (
							<span className="text-xs text-destructive">Eliminated</span>
						)}
					</div>
				</Card>
			))}
		</div>
	);
}
