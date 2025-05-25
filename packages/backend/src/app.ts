import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorMiddleware } from "./common/middleware/error.middleware";
import { loggerMiddleware } from "./common/middleware/logger.middleware";
import { rateLimiter } from "./common/middleware/rate-limit.middleware";
import { config } from "./config";
import { i18nMiddleware } from "./config/i18n";

// Import routes
import authRoutes from "./modules/auth/auth.routes";
import gameRoutes from "./modules/game/game.routes";

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  }),
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// i18n middleware
app.use(i18nMiddleware);

// Logging middleware
app.use(loggerMiddleware);

// Rate limiting
app.use("/api", rateLimiter.general);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);

// Error handling middleware (must be last)
app.use(errorMiddleware);

export { app };
