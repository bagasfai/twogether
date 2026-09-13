"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setParticipantStatus } from "@/lib/actions/participants";
// types/supabase.ts is a plain generated types module (no server-only guard),
// safe to import for real (not type-only) in a client component. Deriving
// from the enum here, rather than hand-copying the union, means a status
// added or removed in the database fails this file at compile time instead of
// silently drifting from lib/dal/participants.ts's RosterEntry type.
import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

type Entry = {
  id: string;
  status: ParticipantStatus;
  registeredAt: string;
  fullName: string | null;
};

export function RosterTable({ sessionId, entries }: { sessionId: string; entries: Entry[] }) {
  const [pending, startTransition] = useTransition();

  const change = (participantId: string, status: Entry["status"]) =>
    startTransition(async () => {
      const result = await setParticipantStatus(participantId, sessionId, status);
      if (result.ok) toast.success("Participant updated");
      else toast.error(result.message);
    });

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody has registered yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Registered</TableHead>
          <TableHead className="text-right">Override</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{entry.fullName ?? "Unnamed player"}</TableCell>
            <TableCell>
              {entry.status === "confirmed" ? (
                <Badge>Confirmed</Badge>
              ) : entry.status === "waiting_list" ? (
                <Badge variant="secondary">Waitlist</Badge>
              ) : (
                <Badge variant="outline">Cancelled</Badge>
              )}
            </TableCell>
            <TableCell>{new Date(entry.registeredAt).toLocaleString()}</TableCell>
            <TableCell className="flex justify-end gap-2">
              {entry.status !== "confirmed" ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => change(entry.id, "confirmed")}>
                  Confirm
                </Button>
              ) : null}
              {entry.status !== "waiting_list" ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => change(entry.id, "waiting_list")}>
                  Waitlist
                </Button>
              ) : null}
              {entry.status !== "cancelled" ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => change(entry.id, "cancelled")}>
                  Cancel
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
