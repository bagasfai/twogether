import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_COLUMNS,
  HOSTS_COLUMNS,
  MEMBERS_COLUMNS,
  REVENUE_COLUMNS,
} from "@/lib/reports/columns";
import { toCsv } from "@/lib/reports/csv";
import { REPORT_ROW_CAP, applyRowCap } from "@/lib/reports/params";

describe("column sets", () => {
  it.each([
    ["attendance", ATTENDANCE_COLUMNS],
    ["revenue", REVENUE_COLUMNS],
    ["members", MEMBERS_COLUMNS],
    ["hosts", HOSTS_COLUMNS],
  ])("%s has unique non-empty headers", (_n, cols) => {
    const headers = cols.map((c) => c.header);
    expect(headers.every((h) => h.length > 0)).toBe(true);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("revenue columns emit integers for money", () => {
    const row = {
      cash_collected: 150000,
      confirmed_count: 10,
      covered_count: 2,
      label: "Sunday",
      occurred_at: "2026-11-01T10:00:00+00:00",
      outstanding: 50000,
      paid_count: 6,
      price: 25000,
      ref_id: "x",
      row_kind: "session",
      unpaid_count: 2,
    };
    for (const h of ["Cash collected (IDR)", "Outstanding (IDR)", "Price (IDR)"]) {
      const col = REVENUE_COLUMNS.find((c) => c.header === h);
      expect(col, h).toBeDefined();
      const v = col!.value(row);
      expect(typeof v).toBe("number");
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("attendance rate renders empty when null", () => {
    const row = {
      attendance_rate: null,
      attended_count: 0,
      cancelled_count: 0,
      full_name: "Ani",
      last_attended_at: null,
      member_id: "m1",
      no_show_count: 0,
      registered_count: 0,
    } as unknown as Parameters<(typeof ATTENDANCE_COLUMNS)[number]["value"]>[0];
    const csv = toCsv(ATTENDANCE_COLUMNS, [row]);
    const idx = ATTENDANCE_COLUMNS.findIndex((c) => c.header === "Attendance rate (%)");
    expect(idx).toBeGreaterThanOrEqual(0);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.split(",")[idx]).toBe("");
  });
});

describe("applyRowCap", () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => i);
  it("exactly cap rows is not truncated", () => {
    const r = applyRowCap(make(REPORT_ROW_CAP));
    expect(r.truncated).toBe(false);
    expect(r.rows).toHaveLength(REPORT_ROW_CAP);
  });
  it("cap + 1 rows is truncated and sliced", () => {
    const r = applyRowCap(make(REPORT_ROW_CAP + 1));
    expect(r.truncated).toBe(true);
    expect(r.rows).toHaveLength(REPORT_ROW_CAP);
  });
});
