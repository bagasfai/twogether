import { z } from "zod";

// Each schema also accepts `null` so it is idempotent: react-hook-form is
// typed on the transformed OUTPUT (see session-form.tsx), so the value the
// Server Action re-parses already has "" turned into null. Without the null
// arm, parse(parse(x)) rejects every blank optional field on the second pass.
const optionalText = z
  .string()
  .trim()
  .max(2000, "Description is too long")
  .or(z.literal(""))
  .or(z.null())
  .transform((value) => (value === "" || value === null ? null : value));

const optionalUrl = z
  .union([z.url("Enter a valid URL"), z.literal(""), z.null()])
  .transform((value) => (value === "" || value === null ? null : value));

// Note: a plain `z.coerce.number().or(z.literal("")).or(z.null())` union
// does NOT work here the way it does for optionalText/optionalUrl above --
// z.coerce.number() coerces "" to 0 via Number(""), so the numeric branch
// silently succeeds on "" before the union ever reaches the literal("")
// arm, turning a blank price into 0 instead of null. Preprocessing "" and
// null to null *before* coercion runs avoids that trap.
const optionalPrice = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z
    .coerce.number()
    .int()
    .min(0, "Cannot be negative")
    .max(10_000_000, "That can't be right")
    .nullable(),
);

export const sessionSchema = z
  .object({
    title: z.string().trim().min(3, "Give the session a title").max(120, "Title is too long"),
    description: optionalText,
    // datetime-local values, e.g. "2026-10-02T19:00" — no timezone suffix
    startsAt: z.string().min(1, "Pick a start time"),
    endsAt: z.string().min(1, "Pick an end time"),
    location: z.string().trim().min(3, "Where is it?").max(200, "Location is too long"),
    locationUrl: optionalUrl,
    price: optionalPrice,
    // mirrors the court_count > 0 CHECK
    courtCount: z.coerce.number().int().min(1, "At least one court").max(20, "That is a lot of courts"),
    // mirrors the max_participants > 0 CHECK
    maxParticipants: z.coerce.number().int().min(1, "At least one player").max(200, "That is a lot of players"),
    // mirrors the waitlist_capacity >= 0 CHECK
    waitlistCapacity: z.coerce.number().int().min(0, "Cannot be negative").max(200, "That is a long waitlist"),
    registrationState: z.enum(["closed", "open"]),
    // a host creates drafts and scheduled sessions; live/completed/cancelled are
    // lifecycle transitions, not things you pick in a create form
    status: z.enum(["draft", "scheduled"]),
  })
  // mirrors the sessions_time_order CHECK so the form catches it before the DB does
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "End time must be after the start time",
    path: ["endsAt"],
  });

export type SessionInput = z.infer<typeof sessionSchema>;

export const sessionIdSchema = z.object({ id: z.uuid() });

// A datetime-local input has no zone designator, so a bare value like
// "2026-10-02T19:00" is ambiguous once it reaches a Server Action: Date
// parsing there happens in the SERVER process's zone (TZ=UTC on Vercel), not
// the browser's. The client is responsible for converting to a zoned instant
// (a "Z" suffix or a "+HH:MM"/"-HH:MM" offset) before it ever reaches the
// action; this predicate lets the action refuse anything that skipped that
// step instead of silently mis-storing it. Exported (rather than inlined in
// the action) purely so it is unit-testable as plain logic.
const ZONED_INSTANT = /([Zz]|[+-]\d{2}:\d{2})$/;

export function isZonedInstant(value: string): boolean {
  return ZONED_INSTANT.test(value);
}
