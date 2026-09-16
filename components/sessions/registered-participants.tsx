"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { PublicRosterEntry } from "@/lib/dal/participants";
import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

const PARTICIPANT_STATUS_MEMBERSHIP = {
  confirmed: true,
  waiting_list: true,
  cancelled: true,
} satisfies Record<ParticipantStatus, true>;

const PARTICIPANT_STATUSES = Object.keys(PARTICIPANT_STATUS_MEMBERSHIP) as ParticipantStatus[];

function isPublicRosterEntry(value: unknown): value is PublicRosterEntry {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.status === "string" &&
    (PARTICIPANT_STATUSES as readonly string[]).includes(row.status) &&
    typeof row.registeredAt === "string" &&
    (row.fullName === null || typeof row.fullName === "string")
  );
}

function isParticipantsResponse(value: unknown): value is { participants: PublicRosterEntry[] | null } {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return row.participants === null || (Array.isArray(row.participants) && row.participants.every(isPublicRosterEntry));
}

type State =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "ready"; entries: PublicRosterEntry[] };

export function RegisteredParticipants({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sessions/${sessionId}/participants`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          setState({ kind: "anonymous" });
          return;
        }
        const body: unknown = await response.json();
        if (!isParticipantsResponse(body) || !body.participants) {
          setState({ kind: "ready", entries: [] });
          return;
        }
        setState({ kind: "ready", entries: body.participants });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "ready", entries: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.kind === "loading") {
    return <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />;
  }

  if (state.kind === "anonymous") {
    return <p className="text-sm text-muted-foreground">Log in to see who&apos;s registered.</p>;
  }

  if (state.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody has registered yet.</p>;
  }

  const confirmed = state.entries.filter((entry) => entry.status === "confirmed");
  const waitlisted = state.entries.filter((entry) => entry.status === "waiting_list");

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        Registered <span className="font-mono tabular-nums text-muted-foreground">({confirmed.length})</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {confirmed.map((entry, index) => (
          <li key={index} className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm font-medium">{entry.fullName ?? "Unnamed player"}</span>
            <Badge variant="success">Confirmed</Badge>
          </li>
        ))}
        {waitlisted.map((entry, index) => (
          <li key={confirmed.length + index} className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm font-medium">{entry.fullName ?? "Unnamed player"}</span>
            <Badge variant="warning">Waitlist</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
