import "dotenv/config";
import { createServer } from "node:http";
import { app } from "./app";
import { logger } from "./common/utils/logger";
import { prisma } from "./common/utils/prisma";
import { config } from "./config";
import { initializeSocketServer } from "./modules/socket/socket.gateway";

const httpServer = createServer(app);
const io = initializeSocketServer(httpServer);

async function gracefulShutdown() {
  logger.info("Shutting down gracefully...");

  // Close socket connections
  io.close(() => {
    logger.info("Socket.io connections closed");
  });

  // Close database connection
  await prisma.$disconnect();

  // Close HTTP server
  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

httpServer.listen(config.port, () => {
  logger.info(`🚀 Server running on http://localhost:${config.port}`);
  logger.info(`🌍 Environment: ${config.nodeEnv}`);
  logger.info("🔌 WebSocket server initialized");
});

export { io };
