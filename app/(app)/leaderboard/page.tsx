import type { Metadata } from "next";
import { PageTitle, SectionTitle } from "@/components/app/page-title";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/ui/user-avatar";
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
        <div className="rounded-2xl border bg-card p-2 shadow-card">
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
                  <span className="flex items-center gap-2">
                    <UserAvatar name={row.name} src={row.avatarUrl} size="sm" />
                    <span>
                      {row.name}
                      {row.isMe ? " (you)" : ""}
                    </span>
                  </span>
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
