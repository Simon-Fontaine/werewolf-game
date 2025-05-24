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
import { requireAuth } from "@/lib/auth-utils";
import { useAuthStore } from "@/stores/authStore";
import { useGameStore } from "@/stores/gameStore";
import {
	type GameState,
	type Player,
	type Role,
	SocketEvent,
} from "@shared/types";
import axios from "axios";
import { Copy, Crown, Loader2, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export default function GameLobbyPage() {
	const t = useTranslations();
	const router = useRouter();
	const pathname = usePathname();
	const locale = useLocale();
	const params = useParams();
	const gameCode = params.code as string;
	const { toast } = useToast();

	const socket = useSocket();
	const { user, accessToken } = useAuthStore();
	const { players, settings, isHost, myRole, setGameState, reset } =
		useGameStore();

	const [isStarting, setIsStarting] = useState(false);
	const [isInitializing, setIsInitializing] = useState(true);
	const hasInitialized = useRef(false);

	// Initialize game data
	const initializeGame = useCallback(async () => {
		if (!user || !accessToken || hasInitialized.current) {
			return;
		}

		try {
			setIsInitializing(true);
			hasInitialized.current = true;

			// Fetch game data from API
			const response = await axios.get(
				`${process.env.NEXT_PUBLIC_API_URL}/api/games/${gameCode}`,
				{
					headers: { Authorization: `Bearer ${accessToken}` },
				},
			);

			if (response.data.success && response.data.data) {
				const { game } = response.data.data;

				// Check if user is in the game
				const currentPlayer = game.players.find(
					(p: Player) => p.userId === user.id,
				);
				if (!currentPlayer) {
					toast({
						title: t("common.error"),
						description: t("errors.unauthorized"),
						variant: "destructive",
					});
					router.push(`/${locale}`);
					return;
				}

				// Update game store
				setGameState({
					gameId: game.id,
					gameCode: game.code,
					players: game.players,
					phase: game.phase,
					dayNumber: game.dayNumber,
					settings: game.settings,
					status: game.status,
					isHost: currentPlayer.isHost,
				});

				// If game already started, redirect to play page
				if (game.status === "IN_PROGRESS") {
					if (currentPlayer.role) {
						setGameState({ myRole: currentPlayer.role });
					}
					router.push(`/${locale}/game/${gameCode}/play`);
					return;
				}
			}
		} catch (error) {
			console.error("Failed to initialize game:", error);
			toast({
				title: t("common.error"),
				description: t("errors.gameNotFound"),
				variant: "destructive",
			});
			router.push(`/${locale}`);
		} finally {
			setIsInitializing(false);
		}
	}, [user, accessToken, gameCode, router, toast, t, setGameState, locale]);

	// Check authentication
	useEffect(() => {
		if (!requireAuth(user, router, pathname, locale)) {
			return;
		}

		if (user && accessToken && !hasInitialized.current) {
			initializeGame();
		}
	}, [user, accessToken, initializeGame, router, pathname, locale]);

	// Setup socket listeners
	useEffect(() => {
		if (!socket || isInitializing || !user) return;

		console.log("Setting up socket listeners");

		// Join the game room via socket
		socket.emit(SocketEvent.JOIN_GAME, gameCode);

		// Listen for game updates
		const handleGameUpdate = (data: { game: GameState }) => {
			console.log("Received game update:", data);
			const { game } = data;
			setGameState({
				players: game.players,
				phase: game.phase,
				dayNumber: game.dayNumber,
				status: game.status,
			});
		};

		// Listen for game started
		const handleGameStarted = (data: { game: GameState }) => {
			console.log("Game started:", data);
			setGameState({
				status: "IN_PROGRESS",
				phase: data.game.phase,
				dayNumber: data.game.dayNumber,
			});
		};

		// Listen for role assignment
		const handleRoleAssigned = (data: { players: Player[]; role: Role }) => {
			console.log("Role assigned:", data.role);
			setGameState({
				myRole: data.role,
				players: data.players,
			});
			// Give a small delay to ensure state is updated
			setTimeout(() => {
				router.push(`/${locale}/game/${gameCode}/play`);
			}, 100);
		};

		// Listen for errors
		const handleError = (error: { message: string }) => {
			console.error("Socket error:", error);
			toast({
				title: t("common.error"),
				description: error.message,
				variant: "destructive",
			});
			setIsStarting(false);
		};

		socket.on(SocketEvent.GAME_UPDATE, handleGameUpdate);
		socket.on(SocketEvent.GAME_STARTED, handleGameStarted);
		socket.on("role-assigned", handleRoleAssigned);
		socket.on("error", handleError);

		return () => {
			socket.off(SocketEvent.GAME_UPDATE, handleGameUpdate);
			socket.off(SocketEvent.GAME_STARTED, handleGameStarted);
			socket.off("role-assigned", handleRoleAssigned);
			socket.off("error", handleError);
		};
	}, [
		socket,
		gameCode,
		isInitializing,
		router,
		toast,
		t,
		setGameState,
		user,
		locale,
	]);

	const handleStartGame = () => {
		if (!socket || !isHost) return;
		setIsStarting(true);
		socket.emit(SocketEvent.START_GAME);
	};

	const handleLeaveGame = () => {
		if (socket) {
			socket.emit(SocketEvent.LEAVE_GAME);
		}
		reset();
		router.push(`/${locale}`);
	};

	const copyGameCode = () => {
		navigator.clipboard.writeText(gameCode);
		toast({
			title: t("game.lobby.codeCopied"),
		});
	};

	// Don't render if not authenticated
	if (!user) {
		return null;
	}

	if (isInitializing) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="flex items-center gap-2">
					<Loader2 className="h-4 w-4 animate-spin" />
					<p>{t("common.loading")}</p>
				</div>
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
								{players.length} / {settings.maxPlayers}
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
							{isStarting ? (
								<div className="flex items-center gap-2">
									<Loader2 className="h-4 w-4 animate-spin" />
									{t("common.loading")}
								</div>
							) : (
								t("game.lobby.startGame")
							)}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
