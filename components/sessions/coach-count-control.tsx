"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adjustCoachCount } from "@/lib/actions/capacity";

const MAX_COACHES = 20;

// Resizes a drilling session. adjust_session_capacity does the real work
// (capacity, courts, waitlist promotion) under the session lock; this control
// only pre-validates what it can see so the shared invalid_state message is
// rarely the first explanation a host gets.
export function CoachCountControl({
  sessionId,
  coachCount,
  seatsPerCoach,
  confirmedCount,
  waitlistCount,
  sessionStatus,
}: {
  sessionId: string;
  coachCount: number;
  seatsPerCoach: number;
  confirmedCount: number;
  waitlistCount: number;
  /** promotion only runs once a session is scheduled or live */
  sessionStatus: "draft" | "scheduled" | "live";
}) {
  const [target, setTarget] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Lowest coach count whose capacity still holds everyone confirmed.
  const minCoaches = Math.max(1, Math.ceil(confirmedCount / seatsPerCoach));
  const canDecrement = coachCount - 1 >= minCoaches;
  const canIncrement = coachCount + 1 <= MAX_COACHES;

  const newCapacity = target === null ? 0 : target * seatsPerCoach;
  const promotes = sessionStatus !== "draft";
  const promoted = target === null || !promotes ? 0 : Math.max(0, Math.min(waitlistCount, newCapacity - confirmedCount));
  const raising = target !== null && target > coachCount;

  const confirm = () => {
    if (target === null) return;
    startTransition(async () => {
      const result = await adjustCoachCount(sessionId, target);
      if (result.ok) {
        toast.success(`Now ${target} ${target === 1 ? "coach" : "coaches"}, ${newCapacity} seats.`);
        setTarget(null);
      } else {
        toast.error(result.message);
        setTarget(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Coaches</span>
          <span className="text-xs text-muted-foreground">
            {seatsPerCoach} seats and one court per coach
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-11 md:size-9"
            aria-label="Remove a coach"
            disabled={!canDecrement || pending}
            onClick={() => setTarget(coachCount - 1)}
          >
            <Minus />
          </Button>
          <span
            className="min-w-8 text-center text-lg tabular-nums"
            aria-live="polite"
            aria-label={`${coachCount} coaches`}
          >
            {coachCount}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-11 md:size-9"
            aria-label="Add a coach"
            disabled={!canIncrement || pending}
            onClick={() => setTarget(coachCount + 1)}
          >
            <Plus />
          </Button>
        </div>
      </div>
      {!canDecrement && coachCount > 1 ? (
        <p className="text-xs text-muted-foreground">
          {confirmedCount} confirmed {confirmedCount === 1 ? "player needs" : "players need"} {minCoaches}{" "}
          {minCoaches === 1 ? "coach" : "coaches"} ({seatsPerCoach} seats each), so you can&apos;t remove one.
          Cancel or hand over a confirmed seat first.
        </p>
      ) : null}

      <Dialog open={target !== null} onOpenChange={(next) => (next ? null : setTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {raising ? "Add a coach?" : "Remove a coach?"}
            </DialogTitle>
            <DialogDescription>
              {target !== null
                ? `Capacity becomes ${newCapacity} seats (${target} ${target === 1 ? "coach" : "coaches"} x ${seatsPerCoach}) with ${target} ${target === 1 ? "court" : "courts"}.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {raising
              ? !promotes
                ? "Nobody is promoted yet: the waitlist is only promoted once the session opens."
                : promoted > 0
                ? `${promoted} ${promoted === 1 ? "person" : "people"} from the waitlist will be promoted to confirmed, premium members first.`
                : "Nobody is promoted: the waitlist is empty."
              : "The extra court is removed. It must be empty and not in use, or this will be refused."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={pending} className="h-11 md:h-9">
              Keep {coachCount}
            </Button>
            <Button onClick={confirm} disabled={pending} className="h-11 md:h-9">
              {pending ? "Applying…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
