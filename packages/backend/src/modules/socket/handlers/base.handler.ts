import type { Server } from "socket.io";
import { logger } from "../../../common/utils/logger";
import type { AuthenticatedSocket } from "../socket.types";

export abstract class BaseSocketHandler {
  constructor(protected io: Server) {}

  protected sendError(
    socket: AuthenticatedSocket,
    message: string,
    code?: string,
  ) {
    socket.emit("error", { message, code });
    logger.error(`Socket error for ${socket.username}: ${message}`);
  }

  protected getRoomName(gameId: string): string {
    return `game:${gameId}`;
  }

  protected async joinRoom(socket: AuthenticatedSocket, gameId: string) {
    const roomName = this.getRoomName(gameId);
    await socket.join(roomName);
    socket.gameId = gameId;
    logger.debug(`Socket ${socket.id} joined room ${roomName}`);
  }

  protected async leaveRoom(socket: AuthenticatedSocket, gameId: string) {
    const roomName = this.getRoomName(gameId);
    await socket.leave(roomName);
    socket.gameId = undefined;
    logger.debug(`Socket ${socket.id} left room ${roomName}`);
  }

  protected emitToRoom(gameId: string, event: string, data: unknown) {
    const roomName = this.getRoomName(gameId);
    this.io.to(roomName).emit(event, data);
  }

  protected emitToRoomExcept(
    gameId: string,
    event: string,
    data: unknown,
    excludeSocketId: string,
  ) {
    const roomName = this.getRoomName(gameId);
    this.io.to(roomName).except(excludeSocketId).emit(event, data);
  }

  abstract handleConnection(socket: AuthenticatedSocket): void;
}
