import type { Metadata } from "next";
import { requireAdmin } from "@/lib/dal/user";
import { getRevenueReport } from "@/lib/dal/reports";
import { resolveReportRange } from "@/lib/reports/today";
import { ReportToolbar } from "@/components/admin/reports/report-nav";
import { RevenueTable } from "@/components/admin/reports/revenue-table";

export const metadata: Metadata = { title: "Revenue report" };

export default async function RevenueReportPage({ searchParams }: PageProps<"/admin/reports/revenue">) {
  await requireAdmin("/admin/reports/revenue");
  const { range, invalid } = resolveReportRange(await searchParams);
  const { rows, truncated } = await getRevenueReport(range);

  return (
    <div className="flex flex-col gap-6">
      <ReportToolbar active="revenue" range={range} invalid={invalid} />
      <RevenueTable rows={rows} truncated={truncated} />
    </div>
  );
}
