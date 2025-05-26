-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('WAITING', 'NIGHT', 'DISCUSSION', 'VOTING', 'EXECUTION', 'GAME_OVER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VILLAGER', 'WEREWOLF', 'SEER', 'DOCTOR', 'HUNTER', 'WITCH', 'CUPID', 'LITTLE_GIRL', 'THIEF', 'SHERIFF');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('VILLAGE', 'WEREWOLF', 'LOVERS', 'NONE');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('WEREWOLF_KILL', 'SEER_CHECK', 'DOCTOR_SAVE', 'WITCH_KILL', 'WITCH_SAVE', 'HUNTER_SHOOT', 'CUPID_LINK', 'SHERIFF_REVEAL', 'THIEF_CHOOSE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('GAME_STARTED', 'PHASE_CHANGED', 'PLAYER_KILLED', 'PLAYER_VOTED', 'PLAYER_ELIMINATED', 'ROLE_REVEALED', 'LOVERS_REVEALED', 'POTION_USED', 'GAME_ENDED', 'PLAYER_DISCONNECTED', 'PLAYER_RECONNECTED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'ROLE', 'DEAD');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('CHAT', 'SYSTEM', 'DEATH_MESSAGE', 'ROLE_ACTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'LOBBY',
    "phase" "GamePhase" NOT NULL DEFAULT 'WAITING',
    "dayNumber" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "winningSide" "Side",
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerNumber" INTEGER NOT NULL,
    "nickname" TEXT NOT NULL,
    "role" "Role",
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "disconnectedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "targetId" TEXT,
    "phase" "GamePhase" NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAction" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "action" "ActionType" NOT NULL,
    "targetId" TEXT,
    "secondaryTargetId" TEXT,
    "phase" "GamePhase" NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "data" JSONB NOT NULL,
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "visibleTo" TEXT[],
    "dayNumber" INTEGER NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleState" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "healPotionUsed" BOOLEAN NOT NULL DEFAULT false,
    "poisonPotionUsed" BOOLEAN NOT NULL DEFAULT false,
    "hasShot" BOOLEAN NOT NULL DEFAULT false,
    "isLover" BOOLEAN NOT NULL DEFAULT false,
    "customData" JSONB,

    CONSTRAINT "RoleState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoverPair" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoverPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTimer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER NOT NULL,
    "pausedAt" TIMESTAMP(3),

    CONSTRAINT "GameTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'CHAT',
    "isAlive" BOOLEAN NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Game_code_key" ON "Game"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_userId_key" ON "GamePlayer"("gameId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_playerNumber_key" ON "GamePlayer"("gameId", "playerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_gameId_voterId_phase_dayNumber_round_key" ON "Vote"("gameId", "voterId", "phase", "dayNumber", "round");

-- CreateIndex
CREATE UNIQUE INDEX "RoleState_playerId_key" ON "RoleState"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoverPair_player1Id_key" ON "LoverPair"("player1Id");

-- CreateIndex
CREATE UNIQUE INDEX "LoverPair_player2Id_key" ON "LoverPair"("player2Id");

-- CreateIndex
CREATE UNIQUE INDEX "GameTimer_gameId_phase_dayNumber_key" ON "GameTimer"("gameId", "phase", "dayNumber");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "GamePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "GamePlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAction" ADD CONSTRAINT "GameAction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAction" ADD CONSTRAINT "GameAction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GamePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleState" ADD CONSTRAINT "RoleState_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleState" ADD CONSTRAINT "RoleState_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GamePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoverPair" ADD CONSTRAINT "LoverPair_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "GamePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoverPair" ADD CONSTRAINT "LoverPair_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "GamePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTimer" ADD CONSTRAINT "GameTimer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GamePlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
