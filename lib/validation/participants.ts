import { z } from "zod";
import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

// Derived from the generated enum type, not hand-written, so a schema change
// in the database forces a compile error here rather than silently drifting.
// A Record<ParticipantStatus, true> only type-checks if every enum member is
// a key -- add or remove one in the database and this line stops compiling.
const PARTICIPANT_STATUS_VALUES = {
  confirmed: true,
  waiting_list: true,
  cancelled: true,
} satisfies Record<ParticipantStatus, true>;

export const setParticipantStatusSchema = z.object({
  participantId: z.uuid(),
  sessionId: z.uuid(),
  status: z.enum(Object.keys(PARTICIPANT_STATUS_VALUES) as [ParticipantStatus, ...ParticipantStatus[]]),
});

export type SetParticipantStatusInput = z.infer<typeof setParticipantStatusSchema>;

export const setCheckedInSchema = z.object({
  participantId: z.uuid(),
  sessionId: z.uuid(),
  checkedIn: z.boolean(),
});

export type SetCheckedInInput = z.infer<typeof setCheckedInSchema>;
