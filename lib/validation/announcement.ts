import { z } from "zod";

export const announcementSchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200, "Title is too long"),
  body: z.string().trim().min(1, "Write something").max(2000, "That's too long"),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;

// Only createAnnouncement needs sessionId -- null means community-wide,
// a uuid means scoped to that session (see the design spec's Schema
// section for the RLS this maps to).
export const createAnnouncementSchema = announcementSchema.extend({
  sessionId: z.union([z.uuid(), z.null()]),
});

export const announcementIdSchema = z.object({ id: z.uuid() });
