import { z } from "zod";

export const createMatchSchema = z
  .object({
    sessionId: z.uuid(),
    courtId: z.uuid(),
    team1: z.array(z.uuid()).min(1, "Team 1 needs at least one player"),
    team2: z.array(z.uuid()).min(1, "Team 2 needs at least one player"),
  })
  .refine((value) => value.team1.length === value.team2.length, {
    message: "Teams must be the same size",
    path: ["team2"],
  })
  .refine((value) => new Set([...value.team1, ...value.team2]).size === value.team1.length + value.team2.length, {
    message: "A player can only be on one team",
    path: ["team2"],
  });

export type CreateMatchInput = z.infer<typeof createMatchSchema>;

export const matchIdSchema = z.object({
  matchId: z.uuid(),
  sessionId: z.uuid(),
});

export type MatchIdInput = z.infer<typeof matchIdSchema>;
