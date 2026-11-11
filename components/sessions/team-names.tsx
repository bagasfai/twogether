import { UserAvatar } from "@/components/ui/user-avatar";

type TeamPlayer = { participantId: string; fullName: string | null; avatarUrl: string | null };

export function TeamNames({ players }: { players: TeamPlayer[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 align-middle">
      {players.map((p, i) => (
        <span key={p.participantId} className="inline-flex items-center gap-1.5">
          {i > 0 ? (
            <>
              <span aria-hidden="true">&amp;</span>
              <span className="sr-only"> and </span>
            </>
          ) : null}
          <UserAvatar name={p.fullName} id={p.participantId} src={p.avatarUrl} size="sm" />
          <span>{p.fullName ?? "Unnamed player"}</span>
        </span>
      ))}
    </span>
  );
}
