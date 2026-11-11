import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal/user";
import { getAttendanceReport } from "@/lib/dal/reports";
import { resolveReportRange } from "@/lib/reports/today";
import { ReportToolbar } from "@/components/admin/reports/report-nav";
import { AttendanceTable } from "@/components/admin/reports/attendance-table";

export const metadata: Metadata = { title: "Attendance report" };

export default async function AttendanceReportPage({ searchParams }: PageProps<"/admin/reports/attendance">) {
  await requireAdmin("/admin/reports/attendance");
  const { range, invalid } = resolveReportRange(await searchParams);
  const { rows, truncated } = await getAttendanceReport(range);

  return (
    <div className="flex flex-col gap-6">
      <ReportToolbar active="attendance" range={range} invalid={invalid} />
      <AttendanceTable rows={rows} truncated={truncated} />
    </div>
  );
}
