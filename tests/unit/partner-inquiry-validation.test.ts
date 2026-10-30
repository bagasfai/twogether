import { describe, expect, it } from "vitest";
import { normaliseWhatsapp, partnerInquirySchema, partnerInquiryStatusSchema } from "@/lib/validation/partner-inquiry";

describe("normaliseWhatsapp", () => {
  it.each(["0812-3456-789", "+62 812 3456 789", "628123456789", "812 3456 789", "(0812) 3456789"])(
    "normalises %s",
    (raw) => expect(normaliseWhatsapp(raw)).toBe("+628123456789"),
  );
  it("keeps foreign numbers", () => {
    expect(normaliseWhatsapp("+44 7700 900123")).toBe("+447700900123");
  });
  it("rejects junk", () => {
    expect(normaliseWhatsapp("12345")).toBeNull();
    expect(normaliseWhatsapp("08abc")).toBeNull();
    expect(normaliseWhatsapp("")).toBeNull();
  });
});

const valid = {
  name: "Budi",
  organisation: "Acme",
  email: "budi@acme.com",
  whatsapp: "0812-3456-789",
  inquiryType: "sponsorship",
  message: "We want to sponsor.",
  website: "",
};

describe("partnerInquirySchema", () => {
  it("normalises whatsapp", () => {
    const r = partnerInquirySchema.parse(valid);
    expect(r.whatsapp).toBe("+628123456789");
  });
  it("rejects empty whatsapp on its path", () => {
    const r = partnerInquirySchema.safeParse({ ...valid, whatsapp: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === "whatsapp")).toBe(true);
  });
  it("rejects a 9-char message", () => {
    expect(partnerInquirySchema.safeParse({ ...valid, message: "123456789" }).success).toBe(false);
  });
  it("rejects unknown inquiry type", () => {
    expect(partnerInquirySchema.safeParse({ ...valid, inquiryType: "collab" }).success).toBe(false);
  });
  it("accepts empty website, defaults it when absent, rejects non-empty", () => {
    expect(partnerInquirySchema.safeParse(valid).success).toBe(true);
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.website;
    expect(partnerInquirySchema.parse(rest).website).toBe("");
    expect(partnerInquirySchema.safeParse({ ...valid, website: "http://spam.com" }).success).toBe(false);
  });
  it("rejects bad email", () => {
    expect(partnerInquirySchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
  it("is idempotent", () => {
    const once = partnerInquirySchema.parse(valid);
    expect(partnerInquirySchema.parse(once)).toEqual(once);
  });
});

describe("partnerInquiryStatusSchema", () => {
  it("accepts known statuses only", () => {
    const id = "3f2b1c4e-0000-4000-8000-000000000001";
    expect(partnerInquiryStatusSchema.safeParse({ id, status: "replied" }).success).toBe(true);
    expect(partnerInquiryStatusSchema.safeParse({ id, status: "done" }).success).toBe(false);
  });
});
