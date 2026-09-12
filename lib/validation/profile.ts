import { z } from "zod";

// Deliberately permissive: the community spans Indonesian mobile, landline and
// the occasional foreign number. Reject obvious junk, do not enforce a country
// format we would have to keep patching.
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,19}$/;

const optionalPhone = z
  .union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")])
  .transform((value) => (value === "" ? null : value));

const optionalUrl = z
  .union([z.url("Enter a valid URL"), z.literal("")])
  .transform((value) => (value === "" ? null : value));

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  phone: optionalPhone,
  avatarUrl: optionalUrl,
});

export type ProfileInput = z.infer<typeof profileSchema>;
