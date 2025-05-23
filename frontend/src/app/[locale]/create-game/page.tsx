"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { useGameStore } from "@/stores/gameStore";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CreateGamePage() {
	const t = useTranslations();
	const router = useRouter();
	const { user } = useAuthStore();
	const { createGame, gameCode, isLoading, error } = useGameStore();

	const [settings, setSettings] = useState({
		minPlayers: 5,
		maxPlayers: 12,
		discussionTime: 180,
		votingTime: 60,
	});

	useEffect(() => {
		if (!user) {
			router.push("/auth/guest");
		}
	}, [user, router]);

	useEffect(() => {
		if (gameCode) {
			router.push(`/game/${gameCode}`);
		}
	}, [gameCode, router]);

	const handleCreate = async () => {
		await createGame(settings);
	};

	return (
		<div className="container mx-auto flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-lg">
				<CardHeader>
					<CardTitle>{t("game.createGame.title")}</CardTitle>
					<CardDescription>{t("game.createGame.settings")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<label htmlFor="minPlayers" className="text-sm font-medium">
							{t("game.createGame.minPlayers")}
						</label>
						<Input
							id="minPlayers"
							type="number"
							min={5}
							max={20}
							value={settings.minPlayers}
							onChange={(e) =>
								setSettings({
									...settings,
									minPlayers: Number.parseInt(e.target.value),
								})
							}
						/>
					</div>
					<div>
						<label htmlFor="maxPlayers" className="text-sm font-medium">
							{t("game.createGame.maxPlayers")}
						</label>
						<Input
							id="maxPlayers"
							type="number"
							min={5}
							max={20}
							value={settings.maxPlayers}
							onChange={(e) =>
								setSettings({
									...settings,
									maxPlayers: Number.parseInt(e.target.value),
								})
							}
						/>
					</div>
					<div>
						<label htmlFor="discussionTime" className="text-sm font-medium">
							{t("game.createGame.discussionTime")}
						</label>
						<Input
							id="discussionTime"
							type="number"
							min={30}
							max={600}
							step={30}
							value={settings.discussionTime}
							onChange={(e) =>
								setSettings({
									...settings,
									discussionTime: Number.parseInt(e.target.value),
								})
							}
						/>
					</div>
					<div>
						<label htmlFor="votingTime" className="text-sm font-medium">
							{t("game.createGame.votingTime")}
						</label>
						<Input
							id="votingTime"
							type="number"
							min={30}
							max={300}
							step={30}
							value={settings.votingTime}
							onChange={(e) =>
								setSettings({
									...settings,
									votingTime: Number.parseInt(e.target.value),
								})
							}
						/>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<div className="flex gap-4">
						<Button
							variant="outline"
							onClick={() => router.push("/")}
							disabled={isLoading}
						>
							{t("common.cancel")}
						</Button>
						<Button
							onClick={handleCreate}
							disabled={isLoading}
							className="flex-1"
						>
							{isLoading ? t("common.loading") : t("game.createGame.create")}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
