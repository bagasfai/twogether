import { jakartaDateString } from "@/lib/format/datetime";
import { parseReportRange, defaultRange, type ReportRange } from "@/lib/reports/params";

// A Date for Asia/Jakarta's calendar "today" (local midnight of that date), so
// date-fns formatting in params.ts yields the Jakarta date regardless of the
// server or browser timezone.
export function jakartaToday(): Date {
  return new Date(`${jakartaDateString()}T00:00:00`);
}

type RawParam = string | string[] | undefined;

// Arrays take the first value; "" is treated as missing (the schema treats it
// as invalid, which would reject a form submitted with an empty field).
export const first = (v: RawParam): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "" ? undefined : s;
};

// Shared by the four report pages. Invalid input falls back to the default
// range and flags it so the page can show a notice.
export function resolveReportRange(searchParams: {
  from?: RawParam;
  to?: RawParam;
}): { range: ReportRange; invalid: boolean } {
  const today = jakartaToday();
  const parsed = parseReportRange(
    { from: first(searchParams.from), to: first(searchParams.to) },
    today,
  );
  if (parsed.ok) return { range: parsed.range, invalid: false };
  return { range: defaultRange(today), invalid: true };
}
