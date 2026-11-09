"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionButton } from "@/components/sessions/confirm-action-button";
import { createCourt, deleteCourt, setCourtStatus } from "@/lib/actions/courts";
import { courtLabel } from "@/lib/court-label";
import type { MatchEntry } from "@/lib/dal/matches";
import type { Database } from "@/types/supabase";

type CourtStatus = Database["public"]["Enums"]["court_status"];

type Court = {
  id: string;
  courtNumber: number;
  status: CourtStatus;
};

const STATUS_LABEL: Record<CourtStatus, string> = {
  idle: "Idle",
  in_use: "In use",
  unavailable: "Unavailable",
};

const STATUS_VARIANT: Record<CourtStatus, "default" | "secondary" | "outline"> = {
  idle: "secondary",
  in_use: "default",
  unavailable: "outline",
};

function teamNames(players: MatchEntry["team1"]) {
  return players.map((p) => p.fullName ?? "Unnamed player").join(" & ");
}

export function CourtPanel({
  sessionId,
  courts,
  courtCount,
  matches,
}: {
  sessionId: string;
  courts: Court[];
  courtCount: number;
  matches: MatchEntry[];
}) {
  const [pending, startTransition] = useTransition();

  const addCourt = () =>
    startTransition(async () => {
      const result = await createCourt(sessionId);
      if (result.ok) toast.success("Court added");
      else toast.error(result.message);
    });

  const changeStatus = (courtId: string, status: CourtStatus) =>
    startTransition(async () => {
      const result = await setCourtStatus(courtId, sessionId, status);
      if (result.ok) toast.success("Court updated");
      else toast.error(result.message);
    });

  const remove = (courtId: string) =>
    startTransition(async () => {
      const result = await deleteCourt(courtId, sessionId);
      if (result.ok) toast.success("Court deleted");
      else toast.error(result.message);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold uppercase italic leading-none tracking-tight">
          Courts <span className="tabular-nums text-muted-foreground">({courts.length}/{courtCount})</span>
        </h2>
        <Button size="sm" className="h-11 sm:h-9" disabled={pending || courts.length >= courtCount} onClick={addCourt}>
          Add court
        </Button>
      </div>

      {courts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No courts created yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {courts.map((court) => {
            const current = matches.find(
              (m) => m.courtId === court.id && (m.status === "scheduled" || m.status === "in_progress"),
            );
            return (
            <li
              key={court.id}
              className={cn(
                "flex flex-col gap-2 rounded-2xl border-2 p-3 sm:flex-row sm:items-center sm:justify-between",
                // Court state is readable at a glance: in use is solid navy, idle
                // is pale sky, unavailable is dashed.
                court.status === "in_use" && "border-navy bg-navy text-white",
                court.status === "idle" && "border-sky-deep/30 bg-sky-pale",
                court.status === "unavailable" && "border-dashed border-input bg-muted text-muted-foreground",
              )}
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <span className="font-display text-2xl font-extrabold uppercase italic leading-none">
                    {courtLabel(court.courtNumber)}
                  </span>
                  <Badge
                    variant={STATUS_VARIANT[court.status]}
                    className={court.status === "in_use" ? "border-transparent bg-cork text-navy" : undefined}
                  >
                    {STATUS_LABEL[court.status]}
                  </Badge>
                </div>
                {current ? (
                  <p className="text-sm [overflow-wrap:anywhere]">
                    <span className="font-semibold">{current.status === "in_progress" ? "Playing" : "Next"}:</span>{" "}
                    {teamNames(current.team1)} vs {teamNames(current.team2)}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
                {(["idle", "in_use", "unavailable"] as const)
                  .filter((status) => status !== court.status)
                  .map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant="outline"
                      // the outline button is white-filled; without this it
                      // inherits the in-use card's text-white and goes blank
                      className={cn("h-11 sm:h-8", court.status === "in_use" && "text-navy")}
                      disabled={pending}
                      onClick={() => changeStatus(court.id, status)}
                    >
                      {STATUS_LABEL[status]}
                    </Button>
                  ))}
                <ConfirmActionButton
                  label="Delete"
                  title={`Delete ${courtLabel(court.courtNumber)}?`}
                  description="The court is removed from this session. A court with a scheduled or in-progress match cannot be deleted."
                  confirmLabel="Delete court"
                  disabled={pending}
                  className={cn("h-11 sm:h-8", court.status === "in_use" && "text-white hover:text-navy")}
                  onConfirm={() => remove(court.id)}
                />
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
