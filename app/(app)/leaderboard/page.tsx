import type { Metadata } from "next";
import { PageTitle, SectionTitle } from "@/components/app/page-title";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAllTimeLeaderboard } from "@/lib/dal/stats";
import { requireUser } from "@/lib/dal/user";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  await requireUser("/leaderboard");
  const rows = await getAllTimeLeaderboard();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageTitle>All-time leaderboard</PageTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed games yet.</p>
      ) : (
        <div className="rounded-2xl border bg-card p-2 shadow-[0_6px_20px_-12px_oklch(28%_0.13_264/0.35)]">
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
              <TableRow key={index} className={row.isMe ? "bg-sky-pale font-semibold" : undefined}>
                <TableCell className="font-display text-xl font-extrabold italic tabular-nums">{row.rank}</TableCell>
                <TableCell>
                  {row.name}
                  {row.isMe ? " (you)" : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.gamesPlayed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}
