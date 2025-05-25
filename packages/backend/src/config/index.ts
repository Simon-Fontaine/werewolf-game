import { z } from "zod";

const configSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.string().transform(Number).default("3001"),
  databaseUrl: z.string().url(),
  clientUrl: z.string().url(),
  jwtSecret: z.string().min(32),
  jwtRefreshSecret: z.string().min(32),
  jwtAccessExpiry: z.string().default("15m"),
  jwtRefreshExpiry: z.string().default("7d"),
});

const configData = {
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  databaseUrl: process.env.DATABASE_URL,
  clientUrl: process.env.CLIENT_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY,
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY,
};

export const config = configSchema.parse(configData);
export type Config = z.infer<typeof configSchema>;
