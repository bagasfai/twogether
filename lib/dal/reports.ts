import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { applyRowCap, type ReportRange } from "@/lib/reports/params";
import type {
  AttendanceRow,
  HostsRow,
  MembersRow,
  RevenueRow,
} from "@/lib/reports/columns";

export type { AttendanceRow, HostsRow, MembersRow, RevenueRow };

export class ReportForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ReportForbiddenError";
  }
}

export type ReportResult<T> = { rows: T[]; truncated: boolean };

type ReportFn =
  | "report_attendance"
  | "report_revenue"
  | "report_members"
  | "report_hosts";

// Authorization is enforced by the RPCs (is_admin check, errcode 42501); the
// role check here is a fast-fail UX guard. Raw DB errors are logged, never
// surfaced: the thrown message is generic.
async function run<T>(fn: ReportFn, range: ReportRange): Promise<ReportResult<T>> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new ReportForbiddenError();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) {
    if (error.code === "42501") throw new ReportForbiddenError();
    console.error(`[reports] ${fn} failed`, error);
    throw new Error("Report query failed");
  }
  return applyRowCap((data ?? []) as T[]);
}

export const getAttendanceReport = (range: ReportRange) =>
  run<AttendanceRow>("report_attendance", range);
export const getRevenueReport = (range: ReportRange) =>
  run<RevenueRow>("report_revenue", range);
export const getMembersReport = (range: ReportRange) =>
  run<MembersRow>("report_members", range);
export const getHostsReport = (range: ReportRange) =>
  run<HostsRow>("report_hosts", range);
