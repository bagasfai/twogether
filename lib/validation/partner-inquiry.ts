import { z } from "zod";
import type { Database } from "@/types/supabase";

type Enums = Database["public"]["Enums"];

export const PARTNER_INQUIRY_TYPES = ["sponsorship", "event", "brand", "media", "other"] as const satisfies readonly Enums["partner_inquiry_type"][];
export const PARTNER_INQUIRY_STATUSES = ["new", "replied", "closed"] as const satisfies readonly Enums["partner_inquiry_status"][];

/**
 * Turn what people type into E.164-ish `+<digits>`, or null if it is not a
 * plausible number. Bare Indonesian forms (08…, 8…, 62…) get +62; anything
 * already starting with `+` keeps its country code. Idempotent.
 */
export function normaliseWhatsapp(raw: string): string | null {
  const s = raw.replace(/[\s\-()]/g, "");
  let out: string;
  if (s.startsWith("+")) out = s;
  else if (s.startsWith("08")) out = `+62${s.slice(1)}`;
  else if (s.startsWith("8")) out = `+62${s}`;
  else if (s.startsWith("62")) out = `+${s}`;
  else return null;
  return /^\+[0-9]{8,15}$/.test(out) ? out : null;
}

export const partnerInquirySchema = z.object({
  name: z.string().trim().min(1, "partner.errors.name").max(100, "partner.errors.nameLong"),
  organisation: z.string().trim().min(1, "partner.errors.organisation").max(120, "partner.errors.organisationLong"),
  email: z
    .string()
    .trim()
    .max(254, "partner.errors.email")
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "partner.errors.email"),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => normaliseWhatsapp(v))
    .refine((v): v is string => v !== null, "partner.errors.whatsapp")
    .transform((v) => v as string),
  inquiryType: z.enum(PARTNER_INQUIRY_TYPES, "partner.errors.inquiryType"),
  message: z.string().trim().min(10, "partner.errors.messageShort").max(4000, "partner.errors.messageLong"),
  // Honeypot: real users never see it. Must stay empty.
  website: z.string().max(0, "partner.errors.spam").default(""),
});

export const partnerInquiryStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(PARTNER_INQUIRY_STATUSES),
});

export type PartnerInquiryInput = z.infer<typeof partnerInquirySchema>;
