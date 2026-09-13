"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelRegistration, registerForSession } from "@/lib/actions/registration";
// Type-only: erased at compile time, so this never pulls the `server-only`
// guard from lib/dal/participants.ts into the client bundle.
import type { MyRegistration } from "@/lib/dal/participants";
// types/supabase.ts is a plain generated types module (no server-only guard),
// safe to import for real (not type-only) in a client component.
import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

// The enum's runtime values, since a `type` import gives us nothing to check
// against at runtime -- this is the one place that has to know them. Derived
// from a Record<ParticipantStatus, true> rather than hand-copied: if the
// database enum ever grows or shrinks, this literal stops satisfying the
// Record type and the file fails to COMPILE, instead of silently keeping a
// stale array that would reject a real status at runtime (previously: a
// member already registered under a new 4th status would see a "Register"
// button and get JB003).
const PARTICIPANT_STATUS_MEMBERSHIP = {
  confirmed: true,
  waiting_list: true,
  cancelled: true,
} satisfies Record<ParticipantStatus, true>;

const PARTICIPANT_STATUSES = Object.keys(PARTICIPANT_STATUS_MEMBERSHIP) as ParticipantStatus[];

function isMyRegistration(value: unknown): value is MyRegistration {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.status === "string" &&
    (PARTICIPANT_STATUSES as readonly string[]).includes(row.status) &&
    typeof row.registeredAt === "string" &&
    (row.waitlistPosition === null || typeof row.waitlistPosition === "number")
  );
}

function isMyRegistrationResponse(value: unknown): value is { registration: MyRegistration | null } {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return row.registration === null || isMyRegistration(row.registration);
}

type State =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "ready"; registration: MyRegistration | null };

export function RegisterPanel({
  sessionId,
  registrationOpen,
}: {
  sessionId: string;
  registrationOpen: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sessions/${sessionId}/my-registration`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          setState({ kind: "anonymous" });
          return;
        }
        const body: unknown = await response.json();
        if (!isMyRegistrationResponse(body)) {
          setState({ kind: "ready", registration: null });
          return;
        }
        setState({ kind: "ready", registration: body.registration });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "ready", registration: null });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (state.kind === "loading") {
    return <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />;
  }

  if (state.kind === "anonymous") {
    return (
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(`/sessions/${sessionId}`)}`}>
          Log in to register
        </Link>
      </Button>
    );
  }

  const registration = state.registration;

  if (registration) {
    return (
      <div className="flex items-center gap-3">
        {registration.status === "confirmed" ? (
          <Badge>Confirmed</Badge>
        ) : (
          <Badge variant="secondary">Waitlist #{registration.waitlistPosition}</Badge>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelRegistration(sessionId);
              if (result.ok) {
                setState({ kind: "ready", registration: null });
                toast.success("Registration cancelled");
              } else {
                toast.error(result.message);
              }
            })
          }
        >
          Cancel registration
        </Button>
      </div>
    );
  }

  if (!registrationOpen) {
    return <p className="text-sm text-muted-foreground">Registration is not open for this session.</p>;
  }

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await registerForSession(sessionId);

          if (result.ok) {
            // the RPC already told us the outcome -- no refetch needed
            setState({
              kind: "ready",
              registration: {
                id: "pending",
                status: result.data.status,
                registeredAt: new Date().toISOString(),
                waitlistPosition: result.data.waitlistPosition,
              },
            });
            toast.success(
              result.data.status === "confirmed"
                ? "You are in."
                : `Added to the waitlist at #${result.data.waitlistPosition}.`,
            );
            return;
          }

          if (result.code === "not_authenticated") {
            window.location.href = `/login?next=${encodeURIComponent(`/sessions/${sessionId}`)}`;
            return;
          }

          toast.error(result.message);
        })
      }
    >
      Register
    </Button>
  );
}
