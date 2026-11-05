import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal/user";
import { getHostsReport } from "@/lib/dal/reports";
import { resolveReportRange } from "@/lib/reports/today";
import { ReportToolbar } from "@/components/admin/reports/report-nav";
import { HostsTable } from "@/components/admin/reports/hosts-table";

export const metadata: Metadata = { title: "Hosts report" };

export default async function HostsReportPage({ searchParams }: PageProps<"/admin/reports/hosts">) {
  await requireAdmin("/admin/reports/hosts");
  const { range, invalid } = resolveReportRange(await searchParams);
  const { rows, truncated } = await getHostsReport(range);

  return (
    <div className="flex flex-col gap-6">
      <ReportToolbar active="hosts" range={range} invalid={invalid} />
      <HostsTable rows={rows} truncated={truncated} />
    </div>
  );
}
