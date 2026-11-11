import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MembersRow } from "@/lib/reports/columns";
import { TruncatedNote } from "@/components/admin/reports/report-nav";
import { date, money, num } from "@/components/admin/reports/format";

export function MembersTable({ rows, truncated }: { rows: MembersRow[]; truncated: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Membership</TableHead>
            <TableHead className="text-right">Plan price</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Quota total</TableHead>
            <TableHead className="text-right">Quota used</TableHead>
            <TableHead className="text-right">Quota left</TableHead>
            <TableHead className="text-right">Sessions attended</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                No members to show.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={`${r.full_name}-${i}`}>
                <TableCell>{r.full_name}</TableCell>
                <TableCell>
                  <Badge variant={r.has_active_membership ? "success" : "outline"}>
                    {r.has_active_membership ? "Active" : "None"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{money(r.plan_price_idr)}</TableCell>
                <TableCell>{date(r.started_at)}</TableCell>
                <TableCell>{date(r.expires_at)}</TableCell>
                <TableCell className="text-right">{num(r.quota_total)}</TableCell>
                <TableCell className="text-right">{num(r.quota_used)}</TableCell>
                <TableCell className="text-right">{num(r.quota_left)}</TableCell>
                <TableCell className="text-right">{num(r.attended_count)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TruncatedNote truncated={truncated} />
    </div>
  );
}
