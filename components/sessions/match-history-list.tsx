import type { MatchEntry, MatchPlayer } from "@/lib/dal/matches";
import { formatTime } from "@/lib/format/datetime";

function names(players: MatchPlayer[]): string {
  return players.map((p) => p.fullName ?? "Player").join(" & ");
}

export function MatchHistoryList({ matches }: { matches: MatchEntry[] }) {
  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">No completed matches in this session.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {matches.map((match, index) => (
        <li key={match.id} className="rounded-2xl border bg-card p-4 text-sm shadow-[0_6px_20px_-12px_oklch(28%_0.13_264/0.35)]">
          <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
            <span className="font-display text-xl font-extrabold uppercase italic leading-none text-foreground">Match {index + 1}</span>
            <span>{match.courtNumber !== null ? `Court ${match.courtNumber}` : "—"}</span>
            {match.completedAt ? <span>{formatTime(match.completedAt)}</span> : null}
          </div>
          <p className="mt-2 text-base font-medium">
            {names(match.team1)} <span className="text-muted-foreground">vs</span> {names(match.team2)}
          </p>
        </li>
      ))}
    </ol>
  );
}
