import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma";

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

// Basic route
app.get("/", (req, res) => {
	res.json({ message: "Werewolf Game API" });
});

// Socket.io connection
io.on("connection", (socket) => {
	console.log("User connected:", socket.id);

	socket.on("disconnect", () => {
		console.log("User disconnected:", socket.id);
	});
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
