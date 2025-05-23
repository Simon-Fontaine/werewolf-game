import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma";
import i18next, { i18nMiddleware } from "./i18n";
import { authenticateSocket } from "./middleware/socketAuth";
import authRoutes from "./routes/auth";
import gameRoutes from "./routes/games";
import { setupGameSocket } from "./sockets/gameSocket";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
	cors: {
		origin: process.env.CLIENT_URL || "http://localhost:3000",
		credentials: true,
	},
});

export const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(
	cors({
		origin: process.env.CLIENT_URL || "http://localhost:3000",
		credentials: true,
	}),
);
app.use(express.json());
app.use(i18nMiddleware);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);

// Basic route
app.get("/", (req, res) => {
	res.json({ message: "Werewolf Game API" });
});

// Socket.io authentication
io.use(authenticateSocket);

// Setup game socket handlers
setupGameSocket(io);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

// Export io and i18next for use in other files
export { io, i18next };
