import type { CsvColumn } from "@/lib/reports/csv";
import type { Database } from "@/types/supabase";

type Fn = Database["public"]["Functions"];

// Row types live here (not in the server-only DAL) so columns stay importable
// from vitest and client code. The DAL re-exports them.
export type AttendanceRow = Fn["report_attendance"]["Returns"][number];
export type RevenueRow = Fn["report_revenue"]["Returns"][number];
export type MembersRow = Fn["report_members"]["Returns"][number];
export type HostsRow = Fn["report_hosts"]["Returns"][number];

// Generated types are non-null, but several RPC columns return null at runtime
// (rates with a zero denominator, missing dates). Normalise to null -> empty cell.
const nn = <T>(v: T | null | undefined): T | null => v ?? null;

export const ATTENDANCE_COLUMNS: CsvColumn<AttendanceRow>[] = [
  { header: "Member", value: (r) => r.full_name },
  { header: "Registered", value: (r) => r.registered_count },
  { header: "Attended", value: (r) => r.attended_count },
  { header: "No-shows", value: (r) => r.no_show_count },
  { header: "Cancelled", value: (r) => r.cancelled_count },
  { header: "Attendance rate (%)", value: (r) => nn(r.attendance_rate) },
  { header: "Last attended", value: (r) => nn(r.last_attended_at) },
];

export const REVENUE_COLUMNS: CsvColumn<RevenueRow>[] = [
  { header: "Type", value: (r) => r.row_kind },
  { header: "Label", value: (r) => r.label },
  { header: "Date", value: (r) => nn(r.occurred_at) },
  { header: "Price (IDR)", value: (r) => nn(r.price) },
  { header: "Confirmed", value: (r) => nn(r.confirmed_count) },
  { header: "Paid", value: (r) => nn(r.paid_count) },
  { header: "Unpaid", value: (r) => nn(r.unpaid_count) },
  { header: "Quota-covered", value: (r) => nn(r.covered_count) },
  { header: "Cash collected (IDR)", value: (r) => nn(r.cash_collected) },
  { header: "Outstanding (IDR)", value: (r) => nn(r.outstanding) },
];

export const MEMBERS_COLUMNS: CsvColumn<MembersRow>[] = [
  { header: "Member", value: (r) => r.full_name },
  { header: "Active membership", value: (r) => (r.has_active_membership ? "Yes" : "No") },
  { header: "Plan price (IDR)", value: (r) => nn(r.plan_price_idr) },
  { header: "Started", value: (r) => nn(r.started_at) },
  { header: "Expires", value: (r) => nn(r.expires_at) },
  { header: "Quota total", value: (r) => nn(r.quota_total) },
  { header: "Quota used", value: (r) => nn(r.quota_used) },
  { header: "Quota left", value: (r) => nn(r.quota_left) },
  { header: "Sessions attended", value: (r) => r.attended_count },
];

export const HOSTS_COLUMNS: CsvColumn<HostsRow>[] = [
  { header: "Host", value: (r) => r.full_name },
  { header: "Sessions hosted", value: (r) => r.sessions_hosted },
  { header: "Completed", value: (r) => r.completed_sessions },
  { header: "Cancelled sessions", value: (r) => r.cancelled_sessions },
  { header: "Avg fill rate (%)", value: (r) => nn(r.avg_fill_rate) },
  { header: "Peak waitlist", value: (r) => r.peak_waitlist },
  { header: "Participant cancellations", value: (r) => r.participant_cancellations },
];
