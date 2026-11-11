import { endOfMonth, format, isValid, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { z } from "zod";

export const REPORT_ROW_CAP = 5000;

export type ReportRange = { from: string; to: string };
export type ReportPreset = "7d" | "30d" | "this-month" | "last-month" | "all";

const DATE_FMT = "yyyy-MM-dd";
const ALL_TIME_START = "2020-01-01";

// Calendar date string: shape check plus a real-calendar check (rejects 2026-02-30).
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => isValid(parseISO(s)));

const fmt = (d: Date) => format(d, DATE_FMT);

export function defaultRange(today: Date): ReportRange {
  return { from: fmt(subDays(today, 29)), to: fmt(today) };
}

export function presetRange(preset: ReportPreset, today: Date): ReportRange {
  switch (preset) {
    case "7d":
      return { from: fmt(subDays(today, 6)), to: fmt(today) };
    case "30d":
      return defaultRange(today);
    case "this-month":
      return { from: fmt(startOfMonth(today)), to: fmt(today) };
    case "last-month": {
      const prev = subMonths(today, 1);
      return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
    }
    case "all":
      return { from: ALL_TIME_START, to: fmt(today) };
  }
}

export function parseReportRange(
  input: { from?: string; to?: string },
  today: Date,
): { ok: true; range: ReportRange } | { ok: false; reason: "invalid" | "order" } {
  if (input.from === undefined && input.to === undefined) {
    return { ok: true, range: defaultRange(today) };
  }
  const from = dateString.safeParse(input.from);
  const to = dateString.safeParse(input.to);
  if (!from.success || !to.success) return { ok: false, reason: "invalid" };
  // yyyy-MM-dd sorts lexicographically as calendar order.
  if (from.data > to.data) return { ok: false, reason: "order" };
  return { ok: true, range: { from: from.data, to: to.data } };
}

// RPCs return up to REPORT_ROW_CAP + 1 rows; the extra row only signals overflow.
export function applyRowCap<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  if (rows.length > REPORT_ROW_CAP) {
    return { rows: rows.slice(0, REPORT_ROW_CAP), truncated: true };
  }
  return { rows, truncated: false };
}
