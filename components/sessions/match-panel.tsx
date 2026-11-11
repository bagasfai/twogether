"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionButton } from "@/components/sessions/confirm-action-button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cancelMatch, completeMatch, createMatch, startMatch } from "@/lib/actions/matches";
import { courtLabel } from "@/lib/court-label";
import type { MatchEntry, MatchStatus } from "@/lib/dal/matches";
import type { RotationEntry } from "@/lib/dal/rotation";

type Court = { id: string; courtNumber: number; status: "idle" | "in_use" | "unavailable" };

function waitLabel(entry: RotationEntry): string {
  const since = entry.lastPlayedAt ?? entry.checkedInAt;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  if (minutes < 1) return entry.lastPlayedAt ? "Last played just now" : "Just checked in";
  const span = minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
  return entry.lastPlayedAt ? `Last played ${span} ago` : `Waiting ${span}`;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<MatchStatus, "default" | "secondary" | "outline" | "success"> = {
  scheduled: "outline",
  in_progress: "success",
  completed: "secondary",
  cancelled: "outline",
};

function TeamNames({ players }: { players: MatchEntry["team1"] }) {
  return <span>{players.map((p) => p.fullName ?? "Unnamed player").join(" & ")}</span>;
}

export function MatchPanel({
  sessionId,
  matches,
  courts,
  rotationQueue,
}: {
  sessionId: string;
  matches: MatchEntry[];
  courts: Court[];
  rotationQueue: RotationEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const [courtId, setCourtId] = useState<string>("");
  const [team1, setTeam1] = useState<Set<string>>(new Set());
  const [team2, setTeam2] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);

  // A court is reserved the moment a scheduled/in_progress match points at
  // it, before its own `status` column flips to in_use at start -- see the
  // matches_reserved_court_idx design note in the migration.
  const reservedCourtIds = useMemo(
    () => new Set(matches.filter((m) => m.status === "scheduled" || m.status === "in_progress").map((m) => m.courtId)),
    [matches],
  );
  const availableCourts = courts.filter((c) => c.status === "idle" && !reservedCourtIds.has(c.id));

  const toggle = (team: 1 | 2, participantId: string) => {
    const [set, setSet, otherSet, setOtherSet] = team === 1 ? [team1, setTeam1, team2, setTeam2] : [team2, setTeam2, team1, setTeam1];
    const next = new Set(set);
    if (next.has(participantId)) next.delete(participantId);
    else next.add(participantId);
    setSet(next);

    if (otherSet.has(participantId)) {
      const nextOther = new Set(otherSet);
      nextOther.delete(participantId);
      setOtherSet(nextOther);
    }
  };

  const visibleMatches = matches.filter((m) => m.status === "scheduled" || m.status === "in_progress");
  const completedMatches = matches.filter((m) => m.status === "completed");

  const canCreate = courtId !== "" && team1.size > 0 && team1.size === team2.size;

  const create = () =>
    startTransition(async () => {
      const result = await createMatch({
        sessionId,
        courtId,
        team1: [...team1],
        team2: [...team2],
      });
      if (result.ok) {
        toast.success("Match created");
        setCourtId("");
        setTeam1(new Set());
        setTeam2(new Set());
        setFormOpen(false);
      } else {
        toast.error(result.message);
      }
    });

  const start = (matchId: string) =>
    startTransition(async () => {
      const result = await startMatch({ matchId, sessionId });
      if (result.ok) toast.success("Match started");
      else toast.error(result.message);
    });

  const complete = (matchId: string) =>
    startTransition(async () => {
      const result = await completeMatch({ matchId, sessionId });
      if (result.ok) toast.success("Match completed");
      else toast.error(result.message);
    });

  const cancel = (matchId: string) =>
    startTransition(async () => {
      const result = await cancelMatch({ matchId, sessionId });
      if (result.ok) toast.success("Match cancelled");
      else toast.error(result.message);
    });

  const renderMatch = (m: MatchEntry) => (
      <li
        key={m.id}
        className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {m.courtNumber !== null ? courtLabel(m.courtNumber) : "No court"}
          </span>
          <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
          <span className="text-sm text-muted-foreground">
            <TeamNames players={m.team1} /> vs <TeamNames players={m.team2} />
          </span>
        </div>
        <div className="flex gap-2">
          {m.status === "scheduled" && (
            <>
              <Button size="sm" className="h-11 flex-1 sm:h-9 sm:flex-none" disabled={pending} onClick={() => start(m.id)}>
                Start
              </Button>
              <ConfirmActionButton
                label="Cancel"
                title="Cancel this match?"
                description="The match is cancelled and its players can be scheduled again."
                confirmLabel="Cancel match"
                disabled={pending}
                className="h-11 flex-1 sm:h-9 sm:flex-none"
                onConfirm={() => cancel(m.id)}
              />
            </>
          )}
          {m.status === "in_progress" && (
            <Button size="sm" className="h-11 flex-1 sm:h-9 sm:flex-none" disabled={pending} onClick={() => complete(m.id)}>
              Complete
            </Button>
          )}
        </div>
      </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-bold uppercase italic leading-none tracking-tight">Matches</h2>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-11 w-full sm:w-auto sm:self-start"
        aria-expanded={formOpen}
        aria-controls="new-match-form"
        onClick={() => setFormOpen((v) => !v)}
      >
        {formOpen ? "Hide new match" : "New match"}
      </Button>

      <div id="new-match-form" hidden={!formOpen} className="flex flex-col gap-3 rounded-2xl border p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="match-court">Court</Label>
          <Select value={courtId} onValueChange={setCourtId}>
            <SelectTrigger id="match-court" className="h-11 w-full">
              <SelectValue placeholder={availableCourts.length === 0 ? "No idle courts" : "Pick a court"} />
            </SelectTrigger>
            <SelectContent>
              {availableCourts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {courtLabel(c.courtNumber)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Players ({team1.size} vs {team2.size})</Label>
          {rotationQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No checked-in players available.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rotationQueue.map((p, index) => (
                <li key={p.participantId} className="flex min-h-11 items-center gap-2 rounded-md px-2">
                  <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                    <span className="text-muted-foreground">#{index + 1}</span> {p.fullName ?? "Unnamed player"}
                    <span className="block text-xs text-muted-foreground">{waitLabel(p)}</span>
                  </span>
                  {([1, 2] as const).map((team) => {
                    const selected = (team === 1 ? team1 : team2).has(p.participantId);
                    return (
                      <button
                        key={team}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${p.fullName ?? "Unnamed player"}, team ${team}`}
                        onClick={() => toggle(team, p.participantId)}
                        className={cn(
                          "size-11 shrink-0 rounded-full border-2 font-display text-lg font-extrabold italic outline-none transition-colors duration-[var(--dur-micro)] focus-visible:ring-[3px] focus-visible:ring-ring md:size-9",
                          selected ? "border-navy bg-navy text-white" : "border-border bg-card text-navy hover:bg-sky-pale",
                        )}
                      >
                        {team}
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button size="sm" disabled={pending || !canCreate} onClick={create} className="h-11 w-full sm:w-auto sm:self-start">
          Create match
        </Button>
      </div>

      {visibleMatches.length === 0 && completedMatches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches yet.</p>
      ) : (
        <>
          {visibleMatches.length > 0 ? <ul className="flex flex-col gap-2">{visibleMatches.map(renderMatch)}</ul> : null}
          {completedMatches.length > 0 ? (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-accent-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                Completed ({completedMatches.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">{completedMatches.map(renderMatch)}</ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
