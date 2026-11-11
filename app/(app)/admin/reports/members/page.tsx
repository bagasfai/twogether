import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal/user";
import { getMembersReport } from "@/lib/dal/reports";
import { resolveReportRange } from "@/lib/reports/today";
import { ReportToolbar } from "@/components/admin/reports/report-nav";
import { MembersTable } from "@/components/admin/reports/members-table";

export const metadata: Metadata = { title: "Members report" };

export default async function MembersReportPage({ searchParams }: PageProps<"/admin/reports/members">) {
  await requireAdmin("/admin/reports/members");
  const { range, invalid } = resolveReportRange(await searchParams);
  const { rows, truncated } = await getMembersReport(range);

  return (
    <div className="flex flex-col gap-6">
      <ReportToolbar active="members" range={range} invalid={invalid} />
      <MembersTable rows={rows} truncated={truncated} />
    </div>
  );
}
