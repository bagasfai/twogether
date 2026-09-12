"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelRegistration, registerForSession } from "@/lib/actions/registration";

type Registration = {
  id: string;
  status: "confirmed" | "waiting_list" | "cancelled";
  registeredAt: string;
  waitlistPosition: number | null;
};

type State =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "ready"; registration: Registration | null };

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
        const body = (await response.json()) as { registration: Registration | null };
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
