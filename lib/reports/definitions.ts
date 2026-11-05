import {
  getAttendanceReport,
  getHostsReport,
  getMembersReport,
  getRevenueReport,
  type AttendanceRow,
  type HostsRow,
  type MembersRow,
  type ReportResult,
  type RevenueRow,
} from "@/lib/dal/reports";
import {
  ATTENDANCE_COLUMNS,
  HOSTS_COLUMNS,
  MEMBERS_COLUMNS,
  REVENUE_COLUMNS,
} from "@/lib/reports/columns";
import type { CsvColumn } from "@/lib/reports/csv";
import type { ReportRange } from "@/lib/reports/params";

export type ReportSlug = "attendance" | "revenue" | "members" | "hosts";

const SLUGS: readonly ReportSlug[] = ["attendance", "revenue", "members", "hosts"];

export function isReportSlug(s: string): s is ReportSlug {
  return (SLUGS as readonly string[]).includes(s);
}

type Definition<T> = {
  title: string;
  fetch: (range: ReportRange) => Promise<ReportResult<T>>;
  columns: CsvColumn<T>[];
};

export const REPORT_DEFINITIONS: {
  attendance: Definition<AttendanceRow>;
  revenue: Definition<RevenueRow>;
  members: Definition<MembersRow>;
  hosts: Definition<HostsRow>;
} = {
  attendance: { title: "Attendance", fetch: getAttendanceReport, columns: ATTENDANCE_COLUMNS },
  revenue: { title: "Revenue", fetch: getRevenueReport, columns: REVENUE_COLUMNS },
  members: { title: "Members", fetch: getMembersReport, columns: MEMBERS_COLUMNS },
  hosts: { title: "Hosts", fetch: getHostsReport, columns: HOSTS_COLUMNS },
};
