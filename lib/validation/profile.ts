import { z } from "zod";
import { GENDERS } from "@/lib/players/levels";
import { optionalPhone } from "@/lib/validation/phone";

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  phone: optionalPhone,
  // Omitted means "leave the stored value alone"; there is no clear-to-null.
  gender: z.enum(GENDERS).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const setAvatarSchema = z.object({
  ext: z.enum(["webp", "jpg"]),
  version: z.number().int().positive(),
});
