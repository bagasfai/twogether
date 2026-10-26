import { z } from "zod";

export const generateSuggestionsSchema = z.object({
  sessionId: z.uuid(),
  format: z.enum(["mens", "womens", "mixed"]),
});

export type GenerateSuggestionsInput = z.infer<typeof generateSuggestionsSchema>;

export const confirmSuggestionsSchema = z
  .object({
    sessionId: z.uuid(),
    matches: z
      .array(
        z.object({
          courtId: z.uuid(),
          team1: z.array(z.uuid()).length(2),
          team2: z.array(z.uuid()).length(2),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine(
    (value) => {
      const ids = value.matches.flatMap((m) => [...m.team1, ...m.team2]);
      return new Set(ids).size === ids.length;
    },
    { message: "A player can only be in one suggested match", path: ["matches"] },
  )
  .refine((value) => new Set(value.matches.map((m) => m.courtId)).size === value.matches.length, {
    message: "A court can only be used once",
    path: ["matches"],
  });

export type ConfirmSuggestionsInput = z.infer<typeof confirmSuggestionsSchema>;
