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

export default function JoinGamePage() {
	const t = useTranslations();
	const router = useRouter();
	const { user } = useAuthStore();
	const { joinGame, gameCode, isLoading, error, clearError } = useGameStore();

	const [code, setCode] = useState("");

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

	const handleJoin = async () => {
		if (code.trim()) {
			await joinGame(code.trim().toUpperCase());
		}
	};

	return (
		<div className="container mx-auto flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t("game.joinGame.title")}</CardTitle>
					<CardDescription>{t("game.joinGame.enterCode")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Input
						placeholder={t("game.joinGame.codePlaceholder")}
						value={code}
						onChange={(e) => {
							setCode(e.target.value.toUpperCase());
							clearError();
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleJoin();
							}
						}}
						maxLength={6}
						className="text-center text-2xl font-mono"
					/>

					{error && (
						<p className="text-sm text-destructive text-center">{error}</p>
					)}

					<div className="flex gap-4">
						<Button
							variant="outline"
							onClick={() => router.push("/")}
							disabled={isLoading}
						>
							{t("common.cancel")}
						</Button>
						<Button
							onClick={handleJoin}
							disabled={isLoading || !code.trim()}
							className="flex-1"
						>
							{isLoading ? t("common.loading") : t("game.joinGame.join")}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
