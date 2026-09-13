"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createCourt, deleteCourt, setCourtStatus } from "@/lib/actions/courts";
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

export function CourtPanel({
  sessionId,
  courts,
  courtCount,
}: {
  sessionId: string;
  courts: Court[];
  courtCount: number;
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
        <h2 className="text-sm font-medium">
          Courts ({courts.length}/{courtCount})
        </h2>
        <Button size="sm" className="h-11 sm:h-9" disabled={pending || courts.length >= courtCount} onClick={addCourt}>
          Add court
        </Button>
      </div>

      {courts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No courts created yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {courts.map((court) => (
            <li
              key={court.id}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Court {court.courtNumber}</span>
                <Badge variant={STATUS_VARIANT[court.status]}>{STATUS_LABEL[court.status]}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
                {(["idle", "in_use", "unavailable"] as const)
                  .filter((status) => status !== court.status)
                  .map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant="outline"
                      className="h-11 sm:h-8"
                      disabled={pending}
                      onClick={() => changeStatus(court.id, status)}
                    >
                      {STATUS_LABEL[status]}
                    </Button>
                  ))}
                <Button size="sm" variant="ghost" className="h-11 sm:h-8" disabled={pending} onClick={() => remove(court.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
