import "dotenv/config";
import { createServer } from "node:http";
import i18next, { i18nMiddleware } from "@/i18n";
import { socketAuthentication } from "@/middleware/socketAuth";
import authRoutes from "@/routes/auth";
import gameRoutes from "@/routes/games";
import { setupGameSocket } from "@/sockets/gameSocket";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma";

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();

const io = new Server(httpServer, {
	cors: {
		origin: process.env.CLIENT_URL,
		credentials: true,
	},
});

// Middleware
app.use(helmet());
app.use(
	cors({
		origin: process.env.CLIENT_URL,
		credentials: true,
	}),
);
app.use(express.json());
app.use(i18nMiddleware);

// Socket.io
io.use(socketAuthentication);
setupGameSocket(io);

// Basic route
app.get("/", (req, res) => {
	res.json({
		message: "Welcome to the backend server! 🐺",
	});
});

app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);

httpServer.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});

export { io, prisma, i18next };
