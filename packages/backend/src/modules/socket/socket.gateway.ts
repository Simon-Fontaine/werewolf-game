import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { logger } from "../../common/utils/logger";
import { config } from "../../config";
import { GameSocketHandler } from "./handlers/game.handler";
import { socketAuthMiddleware } from "./socket.middleware";
import type { AuthenticatedSocket } from "./socket.types";

let io: Server;

export function initializeSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  // Initialize handlers
  const gameHandler = new GameSocketHandler(io);

  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    logger.info(
      `Socket connected: ${authSocket.userId} (${authSocket.username})`,
    );

    // Setup event handlers
    gameHandler.handleConnection(authSocket);

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${authSocket.userId}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}
