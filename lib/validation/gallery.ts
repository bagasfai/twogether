import { z } from "zod";

// Lowercase only: the Storage policy regex is lowercase, so a path with
// uppercase hex would pass here and be rejected there.
const UUID_LOWER = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PHOTO_PATH = new RegExp(`^${UUID_LOWER}/${UUID_LOWER}\\.webp$`);
const LOWER_UUID = z.uuid().refine((v) => v === v.toLowerCase(), "Invalid id");

const caption = z
  .string()
  .trim()
  .max(200, "Caption is too long")
  .transform((v) => (v === "" ? null : v));

export const addGalleryPhotoSchema = z
  .object({
    galleryId: LOWER_UUID,
    path: z.string().regex(PHOTO_PATH, "Invalid photo path"),
    caption,
  })
  .refine((v) => v.path.startsWith(`${v.galleryId}/`), {
    path: ["path"],
    message: "Photo path does not match the album",
  });

export const photoIdSchema = z.object({ photoId: z.uuid() });

export const reviewGalleryPhotoSchema = photoIdSchema.extend({
  action: z.enum(["approve", "reject"]),
});

export const updateCaptionSchema = photoIdSchema.extend({ caption });

export const albumSchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(120, "Title is too long"),
  description: z
    .string()
    .trim()
    .max(1000, "That's too long")
    .transform((v) => (v === "" ? null : v)),
});

export const albumIdSchema = z.object({ id: z.uuid() });

export const updateAlbumSchema = albumSchema.extend({ id: z.uuid() });

export type AddGalleryPhotoInput = z.infer<typeof addGalleryPhotoSchema>;
export type ReviewGalleryPhotoInput = z.infer<typeof reviewGalleryPhotoSchema>;
export type UpdateCaptionInput = z.infer<typeof updateCaptionSchema>;
export type AlbumInput = z.infer<typeof albumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
