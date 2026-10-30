import { z } from "zod";

// Deliberately permissive: the community spans Indonesian mobile, landline and
// the occasional foreign number. Reject obvious junk, do not enforce a country
// format we would have to keep patching.
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,19}$/;

export const requiredPhone = z
  .string()
  .trim()
  .min(1, "Enter a phone number")
  .regex(PHONE_PATTERN, "Enter a valid phone number");

// Each union also accepts `null` so the schema is idempotent: react-hook-form
// is typed on the transformed OUTPUT, so a value already re-parsed once (e.g.
// a Server Action re-validating client input) has already turned "" into
// null. Without this arm, parse(parse(x)) rejects every blank optional field
// on the second pass.
export const optionalPhone = z
  .union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal(""), z.null()])
  .transform((value) => (value === "" || value === null ? null : value));
