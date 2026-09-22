import { z } from "zod";
import { optionalPhone } from "@/lib/validation/phone";

const optionalUrl = z
  .union([z.url("Enter a valid URL"), z.literal(""), z.null()])
  .transform((value) => (value === "" || value === null ? null : value));

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  phone: optionalPhone,
  avatarUrl: optionalUrl,
});

export type ProfileInput = z.infer<typeof profileSchema>;
