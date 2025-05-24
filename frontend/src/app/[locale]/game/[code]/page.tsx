"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/stores/authStore";
import { useGameStore } from "@/stores/gameStore";
import { type Player, SocketEvent } from "@shared/types";
import axios from "axios";
import { Copy, Crown, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function GameLobbyPage() {
	const t = useTranslations();
	const router = useRouter();
	const params = useParams();
	const gameCode = params.code as string;
	const { toast } = useToast();

	const socket = useSocket();
	const { user, accessToken } = useAuthStore();
	const {
		gameId,
		players,
		settings,
		isHost,
		phase,
		myRole,
		updateGameState,
		setPlayers,
		addPlayer,
		removePlayer,
		reset,
	} = useGameStore();

	const [isStarting, setIsStarting] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Fetch game data if not in store (e.g., after refresh)
	useEffect(() => {
		const fetchGameData = async () => {
			if (!accessToken) return;

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
					const currentPlayer = game.players.find(
						(p: Player) => p.userId === user?.id,
					);

					if (!currentPlayer) {
						// User is not in this game
						router.push("/");
						return;
					}

					updateGameState({
						id: game.id,
						code: game.code,
						players: game.players,
						phase: game.phase,
						dayNumber: game.dayNumber,
						settings: game.settings,
					});

					// Set isHost based on current player
					useGameStore.setState({ isHost: currentPlayer.isHost });
				}
			} catch (error) {
				console.error("Failed to fetch game data:", error);
				toast({
					title: t("common.error"),
					description: t("errors.gameNotFound"),
					variant: "destructive",
				});
				router.push("/");
			} finally {
				setIsLoading(false);
			}
		};

		if (!user) {
			router.push("/auth/guest");
			return;
		}

		// If we don't have game data, fetch it
		if (!gameId || players.length === 0) {
			fetchGameData();
		} else {
			setIsLoading(false);
		}
	}, [
		gameCode,
		gameId,
		user,
		accessToken,
		players.length,
		router,
		toast,
		t,
		updateGameState,
	]);

	useEffect(() => {
		if (!socket || !gameId) return;

		// Join the game room
		socket.emit(SocketEvent.JOIN_GAME, gameCode);

		// Socket event listeners
		socket.on(SocketEvent.GAME_UPDATE, (data) => {
			const { game } = data;
			updateGameState({
				id: game.id,
				code: game.code,
				players: game.players,
				phase: game.phase,
				dayNumber: game.dayNumber,
				settings: game.settings,
			});
		});

		socket.on(SocketEvent.PLAYER_JOINED, (data) => {
			const { player } = data;
			// Add the new player to the list
			addPlayer(player);
			toast({
				title: t("game.events.playerJoined", { player: player.nickname }),
			});
		});

		socket.on(SocketEvent.PLAYER_LEFT, (data) => {
			const { userId, username } = data;
			// Remove the player from the list
			removePlayer(userId);
			toast({
				title: t("game.events.playerLeft", { player: username }),
				variant: "destructive",
			});
		});

		socket.on(SocketEvent.GAME_STARTED, (data) => {
			const { yourRole } = data;
			// Store the player's role
			useGameStore.setState({ myRole: yourRole });
			// Navigate to the game page
			router.push(`/game/${gameCode}/play`);
		});

		socket.on("error", (error) => {
			toast({
				title: t("common.error"),
				description: error.message,
				variant: "destructive",
			});
		});

		return () => {
			socket.off(SocketEvent.GAME_UPDATE);
			socket.off(SocketEvent.PLAYER_JOINED);
			socket.off(SocketEvent.PLAYER_LEFT);
			socket.off(SocketEvent.GAME_STARTED);
			socket.off("error");
		};
	}, [
		socket,
		gameCode,
		gameId,
		t,
		toast,
		updateGameState,
		addPlayer,
		removePlayer,
		router,
	]);

	const handleStartGame = () => {
		if (!socket || !isHost) return;
		setIsStarting(true);
		socket.emit(SocketEvent.START_GAME);
	};

	const handleLeaveGame = () => {
		if (!socket) return;
		socket.emit(SocketEvent.LEAVE_GAME);
		reset();
		router.push("/");
	};

	const copyGameCode = () => {
		navigator.clipboard.writeText(gameCode);
		toast({
			title: t("game.lobby.codeCopied"),
		});
	};

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p>{t("common.loading")}</p>
			</div>
		);
	}

	if (!settings) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p>{t("errors.gameNotFound")}</p>
			</div>
		);
	}

	const canStart = players.length >= settings.minPlayers;

	return (
		<div className="container mx-auto p-4 max-w-4xl">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-3xl font-bold">{t("game.lobby.title")}</h1>
				<Button variant="outline" onClick={handleLeaveGame}>
					{t("game.lobby.leaveGame")}
				</Button>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				{/* Game Code Card */}
				<Card>
					<CardHeader>
						<CardTitle>{t("game.lobby.gameCode")}</CardTitle>
						<CardDescription>{t("game.lobby.shareCode")}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-2">
							<div className="flex-1 rounded-lg bg-muted p-4 text-center text-2xl font-mono">
								{gameCode}
							</div>
							<Button
								size="icon"
								variant="outline"
								onClick={copyGameCode}
								title={t("game.lobby.copyCode")}
							>
								<Copy className="h-4 w-4" />
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Game Settings Card */}
				<Card>
					<CardHeader>
						<CardTitle>{t("game.lobby.settings")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								{t("game.createGame.minPlayers")}
							</span>
							<span>{settings.minPlayers}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								{t("game.createGame.maxPlayers")}
							</span>
							<span>{settings.maxPlayers}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								{t("game.createGame.discussionTime")}
							</span>
							<span>{settings.discussionTime}s</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								{t("game.createGame.votingTime")}
							</span>
							<span>{settings.votingTime}s</span>
						</div>
					</CardContent>
				</Card>

				{/* Players Card */}
				<Card className="md:col-span-2">
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="flex items-center gap-2">
								<Users className="h-5 w-5" />
								{t("game.lobby.players")}
							</CardTitle>
							<span className="text-sm text-muted-foreground">
								{t("game.lobby.playerCount", { count: players.length })} /{" "}
								{settings.maxPlayers}
							</span>
						</div>
					</CardHeader>
					<CardContent>
						<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{players.map((player) => (
								<div
									key={player.id}
									className="flex items-center gap-2 rounded-lg border p-3"
								>
									<div className="flex-1">
										<span className="font-medium">{player.nickname}</span>
										{player.userId === user?.id && (
											<span className="ml-2 text-xs text-muted-foreground">
												({t("common.you")})
											</span>
										)}
									</div>
									{player.isHost && (
										<Crown className="h-4 w-4 text-yellow-600" />
									)}
								</div>
							))}
						</div>

						{!canStart && (
							<p className="mt-4 text-center text-sm text-muted-foreground">
								{t("game.lobby.minPlayersRequired", {
									min: settings.minPlayers,
								})}
							</p>
						)}
					</CardContent>
				</Card>

				{/* Start Game Button */}
				{isHost && (
					<div className="md:col-span-2">
						<Button
							onClick={handleStartGame}
							disabled={!canStart || isStarting}
							className="w-full"
							size="lg"
						>
							{isStarting ? t("common.loading") : t("game.lobby.startGame")}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
