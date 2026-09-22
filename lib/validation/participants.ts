import { z } from "zod";
import { optionalPhone } from "@/lib/validation/phone";
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

export const setPaidSchema = z.object({
  participantId: z.uuid(),
  sessionId: z.uuid(),
  paid: z.boolean(),
});

export type SetPaidInput = z.infer<typeof setPaidSchema>;

export const hostAddParticipantSchema = z.object({
  sessionId: z.uuid(),
  userId: z.uuid(),
  status: z
    .enum(Object.keys(PARTICIPANT_STATUS_VALUES) as [ParticipantStatus, ...ParticipantStatus[]])
    .exclude(["cancelled"]),
});

export type HostAddParticipantInput = z.infer<typeof hostAddParticipantSchema>;

export const searchMembersSchema = z.object({
  sessionId: z.uuid(),
  query: z.string().trim().min(1).max(100),
});

export type SearchMembersInput = z.infer<typeof searchMembersSchema>;

export const registerGuestSchema = z.object({
  sessionId: z.uuid(),
  guestName: z.string().trim().min(2, "Enter their name").max(80, "Name is too long"),
  // A guest's phone is a courtesy the registering member may not have --
  // unlike a member's own phone (required at signup), this stays optional.
  guestPhone: optionalPhone,
});

export type RegisterGuestInput = z.infer<typeof registerGuestSchema>;

export const cancelGuestRegistrationSchema = z.object({
  participantId: z.uuid(),
  sessionId: z.uuid(),
});

export type CancelGuestRegistrationInput = z.infer<typeof cancelGuestRegistrationSchema>;
