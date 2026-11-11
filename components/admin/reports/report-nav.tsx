import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportRange } from "@/lib/reports/params";
import { ReportFilters } from "@/components/admin/reports/report-filters";

export const REPORTS = [
  { slug: "attendance", label: "Attendance" },
  { slug: "revenue", label: "Revenue" },
  { slug: "members", label: "Members" },
  { slug: "hosts", label: "Hosts" },
] as const;

export type ReportSlug = (typeof REPORTS)[number]["slug"];

const query = (r: ReportRange) => `from=${r.from}&to=${r.to}`;

// Link-based navigation; the range is carried across reports.
export function ReportNav({ active, range }: { active: ReportSlug; range: ReportRange }) {
  return (
    <nav aria-label="Reports" className="flex flex-wrap gap-2">
      {REPORTS.map((r) => (
        <Link
          key={r.slug}
          href={`/admin/reports/${r.slug}?${query(range)}`}
          aria-current={r.slug === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors md:min-h-9",
            r.slug === active
              ? "border-navy bg-navy text-white"
              : "bg-card hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

// Nav, filters, invalid-range notice and the CSV link, shared by every report page.
export function ReportToolbar({
  active,
  range,
  invalid,
}: {
  active: ReportSlug;
  range: ReportRange;
  invalid: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ReportNav active={active} range={range} />
      {invalid ? (
        <p role="status" className="rounded-lg border border-border bg-sky-pale px-4 py-3 text-sm">
          The date range in the link was not valid, so the last 30 days are shown.
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ReportFilters key={`${range.from}_${range.to}`} range={range} />
        <Button asChild variant="outline">
          <a href={`/admin/reports/${active}/export?${query(range)}`}>
            <Download />
            Download CSV
          </a>
        </Button>
      </div>
    </div>
  );
}

export function TruncatedNote({ truncated, totalsNote = false }: { truncated: boolean; totalsNote?: boolean }) {
  if (!truncated) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Showing first 5000 rows. Narrow the date range to see the rest.
      {totalsNote ? " Totals cover the rows shown." : ""}
    </p>
  );
}
