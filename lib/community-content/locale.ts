import type { Tables } from "@/types/supabase";

export type AboutRow = Tables<"community_about">;
export type FaqRow = Tables<"faq_items">;
export type ContentLocale = "id" | "en";

// Indonesian is the default; anything that is not exactly "en" falls back to it.
export function toContentLocale(locale: string): ContentLocale {
  return locale === "en" ? "en" : "id";
}

export function pickAbout(row: AboutRow, locale: string): { title: string; body: string } {
  return toContentLocale(locale) === "en"
    ? { title: row.title_en, body: row.body_en }
    : { title: row.title_id, body: row.body_id };
}

export function pickFaq(
  row: FaqRow,
  locale: string,
): { id: string; question: string; answer: string } {
  return toContentLocale(locale) === "en"
    ? { id: row.id, question: row.question_en, answer: row.answer_en }
    : { id: row.id, question: row.question_id, answer: row.answer_id };
}
