"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cancelMatch, completeMatch, createMatch, startMatch } from "@/lib/actions/matches";
import type { MatchEntry, MatchStatus } from "@/lib/dal/matches";

type Court = { id: string; courtNumber: number; status: "idle" | "in_use" | "unavailable" };
type RosterPlayer = { id: string; fullName: string | null; checkedInAt: string | null };

const STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<MatchStatus, "default" | "secondary" | "outline"> = {
  scheduled: "secondary",
  in_progress: "default",
  completed: "outline",
  cancelled: "outline",
};

function TeamNames({ players }: { players: MatchEntry["team1"] }) {
  return <span>{players.map((p) => p.fullName ?? "Unnamed player").join(" & ")}</span>;
}

export function MatchPanel({
  sessionId,
  matches,
  courts,
  roster,
}: {
  sessionId: string;
  matches: MatchEntry[];
  courts: Court[];
  roster: RosterPlayer[];
}) {
  const [pending, startTransition] = useTransition();
  const [courtId, setCourtId] = useState<string>("");
  const [team1, setTeam1] = useState<Set<string>>(new Set());
  const [team2, setTeam2] = useState<Set<string>>(new Set());

  // A court is reserved the moment a scheduled/in_progress match points at
  // it, before its own `status` column flips to in_use at start -- see the
  // matches_reserved_court_idx design note in the migration.
  const reservedCourtIds = useMemo(
    () => new Set(matches.filter((m) => m.status === "scheduled" || m.status === "in_progress").map((m) => m.courtId)),
    [matches],
  );
  const availableCourts = courts.filter((c) => c.status === "idle" && !reservedCourtIds.has(c.id));

  const busyPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.status !== "scheduled" && m.status !== "in_progress") continue;
      for (const p of [...m.team1, ...m.team2]) ids.add(p.participantId);
    }
    return ids;
  }, [matches]);
  const assignablePlayers = roster.filter((p) => p.checkedInAt !== null && !busyPlayerIds.has(p.id));

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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">Matches</h2>

      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-1.5">
          <Label>Court</Label>
          <Select value={courtId} onValueChange={setCourtId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={availableCourts.length === 0 ? "No idle courts" : "Pick a court"} />
            </SelectTrigger>
            <SelectContent>
              {availableCourts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  Court {c.courtNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {([1, 2] as const).map((team) => (
            <div key={team} className="flex flex-col gap-1.5">
              <Label>Team {team}</Label>
              {assignablePlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checked-in players available.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {assignablePlayers.map((p) => {
                    const selected = team === 1 ? team1 : team2;
                    return (
                      <li key={p.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`team${team}-${p.id}`}
                          checked={selected.has(p.id)}
                          onCheckedChange={() => toggle(team, p.id)}
                        />
                        <Label htmlFor={`team${team}-${p.id}`} className="font-normal">
                          {p.fullName ?? "Unnamed player"}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>

        <Button size="sm" disabled={pending || !canCreate} onClick={create} className="self-start">
          Create match
        </Button>
      </div>

      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches
            .filter((m) => m.status !== "cancelled")
            .map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {m.courtNumber !== null ? `Court ${m.courtNumber}` : "No court"}
                  </span>
                  <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                  <span className="text-sm text-muted-foreground">
                    <TeamNames players={m.team1} /> vs <TeamNames players={m.team2} />
                  </span>
                </div>
                <div className="flex gap-2">
                  {m.status === "scheduled" && (
                    <>
                      <Button size="sm" disabled={pending} onClick={() => start(m.id)}>
                        Start
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => cancel(m.id)}>
                        Cancel
                      </Button>
                    </>
                  )}
                  {m.status === "in_progress" && (
                    <Button size="sm" disabled={pending} onClick={() => complete(m.id)}>
                      Complete
                    </Button>
                  )}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
