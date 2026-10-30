import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "@/lib/format/datetime";

describe("datetime formatters", () => {
  it("formatDateTime renders Jakarta wall time", () => {
    const out = formatDateTime("2026-10-30T11:00:00Z");
    expect(out).toMatch(/30 Oct 2026/);
    expect(out).toMatch(/18:00/);
    expect(out).toMatch(/Fri/);
  });

  it("formatDate rolls to next day in Jakarta", () => {
    expect(formatDate("2026-10-30T20:00:00Z")).toContain("31 Oct 2026");
  });

  it("formatDate honours locale", () => {
    const out = formatDate("2026-10-30T11:00:00Z", "id-ID");
    expect(out).toContain("30");
    expect(out).toContain("Okt");
  });

  it("returns em dash for missing or invalid input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formatTime renders 24h Jakarta time", () => {
    expect(formatTime("2026-10-30T11:00:00Z")).toBe("18:00");
  });

  it("accepts a Date instance", () => {
    expect(formatTime(new Date("2026-10-30T11:00:00Z"))).toBe("18:00");
  });
});
