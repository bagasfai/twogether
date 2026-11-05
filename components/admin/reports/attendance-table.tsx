import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttendanceRow } from "@/lib/reports/columns";
import { TruncatedNote } from "@/components/admin/reports/report-nav";
import { date, num, percent } from "@/components/admin/reports/format";

export function AttendanceTable({ rows, truncated }: { rows: AttendanceRow[]; truncated: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead className="text-right">Registered</TableHead>
            <TableHead className="text-right">Attended</TableHead>
            <TableHead className="text-right">No-shows</TableHead>
            <TableHead className="text-right">Cancelled</TableHead>
            <TableHead className="text-right">Attendance rate</TableHead>
            <TableHead>Last attended</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No attendance in this date range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={`${r.full_name}-${i}`}>
                <TableCell>{r.full_name}</TableCell>
                <TableCell className="text-right">{num(r.registered_count)}</TableCell>
                <TableCell className="text-right">{num(r.attended_count)}</TableCell>
                <TableCell className="text-right">{num(r.no_show_count)}</TableCell>
                <TableCell className="text-right">{num(r.cancelled_count)}</TableCell>
                <TableCell className="text-right">{percent(r.attendance_rate)}</TableCell>
                <TableCell>{date(r.last_attended_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TruncatedNote truncated={truncated} />
    </div>
  );
}
