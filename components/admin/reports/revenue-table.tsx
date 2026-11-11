import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RevenueRow } from "@/lib/reports/columns";
import { TruncatedNote } from "@/components/admin/reports/report-nav";
import { date, money, num } from "@/components/admin/reports/format";

export function RevenueTable({ rows, truncated }: { rows: RevenueRow[]; truncated: boolean }) {
  // Sum of the displayed rows (session and membership); rows are capped upstream.
  const cash = rows.reduce((s, r) => s + (r.cash_collected ?? 0), 0);
  const outstanding = rows.reduce((s, r) => s + (r.outstanding ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Confirmed</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Unpaid</TableHead>
            <TableHead className="text-right">Quota-covered</TableHead>
            <TableHead className="text-right">Cash collected</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                No revenue in this date range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={`${r.row_kind}-${r.ref_id ?? i}`}>
                <TableCell>
                  <Badge variant={r.row_kind === "membership" ? "secondary" : "outline"}>
                    {r.row_kind === "membership" ? "Membership" : "Session"}
                  </Badge>
                </TableCell>
                <TableCell>{r.label}</TableCell>
                <TableCell>{date(r.occurred_at)}</TableCell>
                <TableCell className="text-right">{money(r.price)}</TableCell>
                <TableCell className="text-right">{num(r.confirmed_count)}</TableCell>
                <TableCell className="text-right">{num(r.paid_count)}</TableCell>
                <TableCell className="text-right">{num(r.unpaid_count)}</TableCell>
                <TableCell className="text-right">{num(r.covered_count)}</TableCell>
                <TableCell className="text-right">{money(r.cash_collected)}</TableCell>
                <TableCell className="text-right">{money(r.outstanding)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {rows.length > 0 ? (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={8} className="font-medium">
                {truncated ? "Total (shown rows)" : "Total"}
              </TableCell>
              <TableCell className="text-right font-medium">{money(cash)}</TableCell>
              <TableCell className="text-right font-medium">{money(outstanding)}</TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      <TruncatedNote truncated={truncated} totalsNote />
    </div>
  );
}
