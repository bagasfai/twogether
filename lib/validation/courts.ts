import { z } from "zod";
import type { Database } from "@/types/supabase";

type CourtStatus = Database["public"]["Enums"]["court_status"];

// Derived from the generated enum type, not hand-written -- see
// lib/validation/participants.ts's PARTICIPANT_STATUS_VALUES for why.
const COURT_STATUS_VALUES = {
  idle: true,
  in_use: true,
  unavailable: true,
} satisfies Record<CourtStatus, true>;

export const createCourtSchema = z.object({
  sessionId: z.uuid(),
});

export type CreateCourtInput = z.infer<typeof createCourtSchema>;

export const setCourtStatusSchema = z.object({
  courtId: z.uuid(),
  sessionId: z.uuid(),
  status: z.enum(Object.keys(COURT_STATUS_VALUES) as [CourtStatus, ...CourtStatus[]]),
});

export type SetCourtStatusInput = z.infer<typeof setCourtStatusSchema>;

export const deleteCourtSchema = z.object({
  courtId: z.uuid(),
  sessionId: z.uuid(),
});

export type DeleteCourtInput = z.infer<typeof deleteCourtSchema>;
