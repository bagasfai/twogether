import type { MatchEntry, MatchPlayer } from "@/lib/dal/matches";

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
        <li key={match.id} className="rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
            <span className="font-medium text-foreground">Match {index + 1}</span>
            <span>{match.courtNumber !== null ? `Court ${match.courtNumber}` : "—"}</span>
            {match.completedAt ? <span>{new Date(match.completedAt).toLocaleTimeString()}</span> : null}
          </div>
          <p className="mt-2">
            {names(match.team1)} <span className="text-muted-foreground">vs</span> {names(match.team2)}
          </p>
        </li>
      ))}
    </ol>
  );
}
