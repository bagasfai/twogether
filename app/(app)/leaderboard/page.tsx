import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAllTimeLeaderboard } from "@/lib/dal/stats";
import { requireUser } from "@/lib/dal/user";

export default async function LeaderboardPage() {
  await requireUser("/leaderboard");
  const rows = await getAllTimeLeaderboard();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">All-time leaderboard</h1>
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
            {rows.map((row, index) => (
              <TableRow key={index} className={row.isMe ? "bg-accent/10 font-medium" : undefined}>
                <TableCell>{row.rank}</TableCell>
                <TableCell>
                  {row.name}
                  {row.isMe ? " (you)" : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.gamesPlayed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
