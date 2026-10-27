import { z } from "zod";
import { GENDERS, SKILL_LEVELS } from "@/lib/players/levels";

// Enums derive from the constants in lib/players/levels.ts so there is one
// source of truth for the allowed values.
const skillLevelSchema = z.enum(SKILL_LEVELS);
const genderSchema = z.enum(GENDERS);

export const setMemberLevelSchema = z.object({
  userId: z.guid(),
  level: skillLevelSchema,
});

export type SetMemberLevelInput = z.infer<typeof setMemberLevelSchema>;

export const setGuestAttributesSchema = z.object({
  participantId: z.uuid(),
  gender: genderSchema.optional(),
  level: skillLevelSchema.nullable().optional(),
});

export type SetGuestAttributesInput = z.infer<typeof setGuestAttributesSchema>;

export const setMemberGenderSchema = z.object({
  userId: z.guid(),
  gender: genderSchema,
});

export type SetMemberGenderInput = z.infer<typeof setMemberGenderSchema>;
