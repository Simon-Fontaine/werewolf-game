import { z } from "zod";
import {
  MAX_DISCUSSION_TIME,
  MAX_PLAYERS,
  MAX_VOTING_TIME,
  MIN_DISCUSSION_TIME,
  MIN_PLAYERS,
  MIN_VOTING_TIME,
} from "../constants";
import { Role } from "../types";

const baseGameSettingsSchema = z.object({
  minPlayers: z.number().min(MIN_PLAYERS).max(MAX_PLAYERS),
  maxPlayers: z.number().min(MIN_PLAYERS).max(MAX_PLAYERS),
  discussionTime: z.number().min(MIN_DISCUSSION_TIME).max(MAX_DISCUSSION_TIME),
  votingTime: z.number().min(MIN_VOTING_TIME).max(MAX_VOTING_TIME),
  nightTime: z.number().min(30).max(300),
  roles: z.record(z.nativeEnum(Role), z.number().min(0)),
});

export const gameSettingsSchema = baseGameSettingsSchema.refine(
  (data) => data.maxPlayers >= data.minPlayers,
  {
    message: "maxPlayers must be greater than or equal to minPlayers",
    path: ["maxPlayers"],
  },
);

export const createGameSchema = z.object({
  settings: baseGameSettingsSchema.partial().optional(),
  locale: z.enum(["en", "fr"]).default("en"),
});

export const joinGameSchema = z.object({
  code: z.string().length(6).toUpperCase(),
});

export const voteSchema = z.object({
  targetId: z.string().nullable(),
});

export const nightActionSchema = z.object({
  action: z.string(),
  targetId: z.string(),
});

export type GameSettingsInput = z.infer<typeof gameSettingsSchema>;
export type CreateGameInput = z.infer<typeof createGameSchema>;
export type JoinGameInput = z.infer<typeof joinGameSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
export type NightActionInput = z.infer<typeof nightActionSchema>;
