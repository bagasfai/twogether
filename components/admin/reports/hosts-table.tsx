import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HostsRow } from "@/lib/reports/columns";
import { TruncatedNote } from "@/components/admin/reports/report-nav";
import { num, percent } from "@/components/admin/reports/format";

export function HostsTable({ rows, truncated }: { rows: HostsRow[]; truncated: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Host</TableHead>
            <TableHead className="text-right">Sessions hosted</TableHead>
            <TableHead className="text-right">Completed</TableHead>
            <TableHead className="text-right">Cancelled sessions</TableHead>
            <TableHead className="text-right">Avg fill rate</TableHead>
            <TableHead className="text-right">Peak waitlist</TableHead>
            <TableHead className="text-right">Participant cancellations</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No hosted sessions in this date range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={`${r.full_name}-${i}`}>
                <TableCell>{r.full_name}</TableCell>
                <TableCell className="text-right">{num(r.sessions_hosted)}</TableCell>
                <TableCell className="text-right">{num(r.completed_sessions)}</TableCell>
                <TableCell className="text-right">{num(r.cancelled_sessions)}</TableCell>
                <TableCell className="text-right">{percent(r.avg_fill_rate)}</TableCell>
                <TableCell className="text-right">{num(r.peak_waitlist)}</TableCell>
                <TableCell className="text-right">{num(r.participant_cancellations)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TruncatedNote truncated={truncated} />
    </div>
  );
}
