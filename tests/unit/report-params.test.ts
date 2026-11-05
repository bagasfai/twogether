import { describe, expect, it } from "vitest";
import {
  defaultRange,
  parseReportRange,
  presetRange,
  REPORT_ROW_CAP,
} from "@/lib/reports/params";

const today = new Date(2026, 10, 4); // 2026-11-04 local

describe("report params", () => {
  it("exposes the row cap", () => {
    expect(REPORT_ROW_CAP).toBe(5000);
  });

  it("defaultRange gives 30 inclusive days ending today", () => {
    expect(defaultRange(today)).toEqual({ from: "2026-10-06", to: "2026-11-04" });
  });

  it("presetRange 7d is 7 inclusive days", () => {
    expect(presetRange("7d", today)).toEqual({ from: "2026-10-29", to: "2026-11-04" });
  });

  it("presetRange this-month / last-month boundaries", () => {
    expect(presetRange("this-month", today)).toEqual({ from: "2026-11-01", to: "2026-11-04" });
    expect(presetRange("last-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    const jan = new Date(2026, 0, 15);
    expect(presetRange("last-month", jan)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("presetRange all starts 2020-01-01", () => {
    expect(presetRange("all", today)).toEqual({ from: "2020-01-01", to: "2026-11-04" });
  });

  it("parseReportRange both missing returns default", () => {
    expect(parseReportRange({}, today)).toEqual({ ok: true, range: defaultRange(today) });
  });

  it("rejects one missing", () => {
    expect(parseReportRange({ from: "2026-11-01" }, today)).toEqual({ ok: false, reason: "invalid" });
    expect(parseReportRange({ to: "2026-11-01" }, today)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects malformed and non-calendar dates", () => {
    expect(parseReportRange({ from: "2026-02-30", to: "2026-03-01" }, today)).toEqual({ ok: false, reason: "invalid" });
    expect(parseReportRange({ from: "nope", to: "2026-03-01" }, today)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects from after to with reason order", () => {
    expect(parseReportRange({ from: "2026-11-02", to: "2026-11-01" }, today)).toEqual({ ok: false, reason: "order" });
  });

  it("accepts from equal to", () => {
    expect(parseReportRange({ from: "2026-11-01", to: "2026-11-01" }, today)).toEqual({
      ok: true,
      range: { from: "2026-11-01", to: "2026-11-01" },
    });
  });
});
