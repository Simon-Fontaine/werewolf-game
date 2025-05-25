import { type Prisma, PrismaClient } from "@prisma/client";
import type { DefaultArgs } from "@prisma/client/runtime/library";
import { logger } from "./logger";

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      {
        emit: "event",
        level: "query",
      },
      {
        emit: "event",
        level: "error",
      },
      {
        emit: "event",
        level: "info",
      },
      {
        emit: "event",
        level: "warn",
      },
    ],
  });
};

declare global {
  var __prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.__prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

// Log Prisma queries in development
if (process.env.NODE_ENV === "development") {
  prisma.$on("query" as never, (e: { query: string; duration: number }) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

export type PrismaTransactionClient = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
