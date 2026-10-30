import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SessionLeaderboardRow } from "@/lib/dal/stats";

export function SessionLeaderboard({ rows }: { rows: SessionLeaderboardRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Games played</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed games yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Games</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.participantId}>
                  <TableCell>{row.rank}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {row.name}
                      {row.isGuest ? <Badge variant="outline">Guest</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.gamesPlayed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
