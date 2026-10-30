import { z } from "zod";
import type { Database } from "@/types/supabase";

type Enums = Database["public"]["Enums"];

// Tuples mirror the DB enums; the `satisfies` checks fail the type-check if
// they drift.
export const SOCIAL_PLATFORMS = ["instagram", "tiktok", "threads", "whatsapp", "ayo", "other"] as const satisfies readonly Enums["social_platform"][];
export const FEATURED_POST_KINDS = ["schedule", "match", "video", "other"] as const satisfies readonly Enums["featured_post_kind"][];

const httpsUrl = z
  .string()
  .trim()
  .max(500, "URL is too long")
  .regex(/^https:\/\//, "URL must start with https://");

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: httpsUrl,
  label: z.string().trim().min(1, "Enter a label").max(80, "Label is too long"),
  isVisible: z.boolean(),
});

export const socialLinkIdSchema = z.object({ id: z.uuid() });

export const socialLinkMoveSchema = socialLinkIdSchema.extend({
  direction: z.enum(["up", "down"]),
});

const caption = (label: string) =>
  z.string().trim().min(1, `Enter the ${label} caption`).max(200, "Caption is too long");

export const featuredPostSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  postUrl: httpsUrl,
  captionEn: caption("English"),
  captionId: caption("Indonesian"),
  kind: z.enum(FEATURED_POST_KINDS),
  postedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  isVisible: z.boolean(),
});

// Object path in the featured-posts bucket: `{uuid}.{webp|jpg}`, no folder.
export const FEATURED_POST_IMAGE_PATH = /^[0-9a-f-]{36}\.(webp|jpg)$/;
export const featuredPostImagePathSchema = z.string().regex(FEATURED_POST_IMAGE_PATH, "Invalid image path");

export type SocialLinkInput = z.infer<typeof socialLinkSchema>;
export type FeaturedPostInput = z.infer<typeof featuredPostSchema>;
