import { describe, expect, it } from "vitest";
import {
  aboutSchema,
  faqIdSchema,
  faqItemSchema,
  faqMoveSchema,
} from "@/lib/validation/community-content";
import { pickAbout, pickFaq, toContentLocale } from "@/lib/community-content/locale";
import { faqJsonLd } from "@/lib/community-content/json-ld";

const about = { titleEn: "T", titleId: "J", bodyEn: "B", bodyId: "I" };
const faq = { questionEn: "Q", questionId: "P", answerEn: "A", answerId: "J" };
const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";

describe("aboutSchema", () => {
  it("trims whitespace", () => {
    const r = aboutSchema.parse({ ...about, titleEn: "  Hi  " });
    expect(r.titleEn).toBe("Hi");
  });
  it.each(["titleEn", "titleId", "bodyEn", "bodyId"] as const)("rejects empty and blank %s", (k) => {
    expect(aboutSchema.safeParse({ ...about, [k]: "" }).success).toBe(false);
    expect(aboutSchema.safeParse({ ...about, [k]: "  \t\n " }).success).toBe(false);
  });
  it("enforces caps", () => {
    expect(aboutSchema.safeParse({ ...about, titleEn: "a".repeat(121) }).success).toBe(false);
    expect(aboutSchema.safeParse({ ...about, bodyId: "a".repeat(8001) }).success).toBe(false);
    expect(aboutSchema.safeParse({ ...about, titleEn: "a".repeat(120), bodyEn: "a".repeat(8000) }).success).toBe(true);
  });
  it("accepts multi-byte Indonesian text", () => {
    expect(aboutSchema.safeParse({ ...about, bodyId: "Selamat datang, komunitas bulu tangkis Jakarta Barat ✨" }).success).toBe(true);
  });
  it("preserves inner CRLF while trimming ends", () => {
    const r = aboutSchema.parse({ ...about, bodyEn: "\r\n  a\r\n\r\nb  \r\n" });
    expect(r.bodyEn).toBe("a\r\n\r\nb");
  });
});

describe("faqItemSchema", () => {
  it.each(["questionEn", "questionId", "answerEn", "answerId"] as const)("rejects empty and blank %s", (k) => {
    expect(faqItemSchema.safeParse({ ...faq, [k]: "" }).success).toBe(false);
    expect(faqItemSchema.safeParse({ ...faq, [k]: "   " }).success).toBe(false);
  });
  it("enforces caps", () => {
    expect(faqItemSchema.safeParse({ ...faq, questionEn: "a".repeat(201) }).success).toBe(false);
    expect(faqItemSchema.safeParse({ ...faq, answerId: "a".repeat(4001) }).success).toBe(false);
    expect(faqItemSchema.safeParse({ ...faq, questionEn: "a".repeat(200), answerEn: "a".repeat(4000) }).success).toBe(true);
  });
  it("trims", () => {
    expect(faqItemSchema.parse({ ...faq, questionEn: " x " }).questionEn).toBe("x");
  });
});

describe("faq id/move schemas", () => {
  it("accepts uuid", () => {
    expect(faqIdSchema.safeParse({ id: ID }).success).toBe(true);
    expect(faqMoveSchema.safeParse({ id: ID, direction: "up" }).success).toBe(true);
  });
  it("rejects bad direction and non-uuid", () => {
    expect(faqMoveSchema.safeParse({ id: ID, direction: "sideways" }).success).toBe(false);
    expect(faqMoveSchema.safeParse({ id: "nope", direction: "up" }).success).toBe(false);
    expect(faqIdSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});

describe("locale", () => {
  it("falls back to id", () => {
    expect(toContentLocale("fr")).toBe("id");
    expect(toContentLocale("en")).toBe("en");
    expect(toContentLocale("id")).toBe("id");
  });
  const row = {
    id: ID,
    question_en: "QE",
    question_id: "QI",
    answer_en: "AE",
    answer_id: "AI",
    sort_order: 1,
    created_at: "",
    updated_at: "",
  };
  it("pickFaq picks by locale", () => {
    expect(pickFaq(row, "en")).toEqual({ id: ID, question: "QE", answer: "AE" });
    expect(pickFaq(row, "id")).toEqual({ id: ID, question: "QI", answer: "AI" });
    expect(pickFaq(row, "fr")).toEqual({ id: ID, question: "QI", answer: "AI" });
  });
  it("pickAbout picks by locale", () => {
    const a = { id: true, title_en: "TE", title_id: "TI", body_en: "BE", body_id: "BI", updated_at: "", updated_by: null };
    expect(pickAbout(a, "en")).toEqual({ title: "TE", body: "BE" });
    expect(pickAbout(a, "fr")).toEqual({ title: "TI", body: "BI" });
  });
});

describe("faqJsonLd", () => {
  it("builds FAQPage", () => {
    const j = JSON.parse(faqJsonLd([{ question: "Q?", answer: "A" }]));
    expect(j["@type"]).toBe("FAQPage");
    expect(j.mainEntity).toHaveLength(1);
    expect(j.mainEntity[0]["@type"]).toBe("Question");
    expect(j.mainEntity[0].name).toBe("Q?");
    expect(j.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(j.mainEntity[0].acceptedAnswer.text).toBe("A");
  });
  it("cannot break out of script tag and round-trips", () => {
    const out = faqJsonLd([{ question: "<q>", answer: "</script><b>x" }]);
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c/script>");
    const j = JSON.parse(out);
    expect(j.mainEntity[0].acceptedAnswer.text).toBe("</script><b>x");
    expect(j.mainEntity[0].name).toBe("<q>");
  });
  it("empty input gives empty mainEntity", () => {
    expect(JSON.parse(faqJsonLd([])).mainEntity).toEqual([]);
  });
});
