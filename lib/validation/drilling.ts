import { z } from "zod";

export const adjustCapacitySchema = z.object({
  sessionId: z.uuid(),
  coachCount: z.coerce.number().int().min(1, "At least one coach").max(20, "That is a lot of coaches"),
});

export type AdjustCapacityInput = z.infer<typeof adjustCapacitySchema>;

export const transferSeatSchema = z.object({
  participantId: z.uuid(),
  toUserId: z.uuid(),
});

export type TransferSeatInput = z.infer<typeof transferSeatSchema>;
