import { z } from "zod";

// Caps mirror the DB check constraints on community_about / faq_items.
export const aboutSchema = z.object({
  titleEn: z.string().trim().min(1, "Give it a title").max(120, "Title is too long"),
  titleId: z.string().trim().min(1, "Give it a title").max(120, "Title is too long"),
  bodyEn: z.string().trim().min(1, "Write something").max(8000, "That's too long"),
  bodyId: z.string().trim().min(1, "Write something").max(8000, "That's too long"),
});

export type AboutInput = z.infer<typeof aboutSchema>;

export const faqItemSchema = z.object({
  questionEn: z.string().trim().min(1, "Write a question").max(200, "Question is too long"),
  questionId: z.string().trim().min(1, "Write a question").max(200, "Question is too long"),
  answerEn: z.string().trim().min(1, "Write an answer").max(4000, "Answer is too long"),
  answerId: z.string().trim().min(1, "Write an answer").max(4000, "Answer is too long"),
});

export type FaqItemInput = z.infer<typeof faqItemSchema>;

export const faqIdSchema = z.object({ id: z.uuid() });

export const faqMoveSchema = z.object({
  id: z.uuid(),
  direction: z.enum(["up", "down"]),
});
