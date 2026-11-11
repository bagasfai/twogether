import type { MatchEntry, MatchPlayer } from "@/lib/dal/matches";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatTime } from "@/lib/format/datetime";

function Names({ players }: { players: MatchPlayer[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 align-middle">
      {players.map((p, i) => (
        <span key={p.participantId} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span>&amp;</span> : null}
          <UserAvatar name={p.fullName} id={p.participantId} src={p.avatarUrl} size="sm" />
          <span>{p.fullName ?? "Player"}</span>
        </span>
      ))}
    </span>
  );
}

export function MatchHistoryList({ matches }: { matches: MatchEntry[] }) {
  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">No completed matches in this session.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {matches.map((match, index) => (
        <li key={match.id} className="rounded-2xl border bg-card p-4 text-sm shadow-card">
          <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
            <span className="font-display text-xl font-extrabold uppercase italic leading-none text-foreground">Match {index + 1}</span>
            <span>{match.courtNumber !== null ? `Court ${match.courtNumber}` : "—"}</span>
            {match.completedAt ? <span>{formatTime(match.completedAt)}</span> : null}
          </div>
          <p className="mt-2 text-base font-medium">
            <Names players={match.team1} /> <span className="text-muted-foreground">vs</span> <Names players={match.team2} />
          </p>
        </li>
      ))}
    </ol>
  );
}
