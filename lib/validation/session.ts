import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(2000, "Description is too long")
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

const optionalUrl = z
  .union([z.url("Enter a valid URL"), z.literal("")])
  .transform((value) => (value === "" ? null : value));

export const sessionSchema = z
  .object({
    title: z.string().trim().min(3, "Give the session a title").max(120, "Title is too long"),
    description: optionalText,
    // datetime-local values, e.g. "2026-10-02T19:00" — no timezone suffix
    startsAt: z.string().min(1, "Pick a start time"),
    endsAt: z.string().min(1, "Pick an end time"),
    location: z.string().trim().min(3, "Where is it?").max(200, "Location is too long"),
    locationUrl: optionalUrl,
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
