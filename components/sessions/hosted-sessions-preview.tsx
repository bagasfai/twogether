"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HostedSession } from "@/lib/dal/sessions";

function isHostedSession(value: unknown): value is HostedSession {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.startsAt === "string" &&
    typeof row.location === "string" &&
    typeof row.status === "string"
  );
}

function isHostedSessionsResponse(value: unknown): value is { sessions: HostedSession[] | null } {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return row.sessions === null || (Array.isArray(row.sessions) && row.sessions.every(isHostedSession));
}

type State = { kind: "loading" } | { kind: "empty" } | { kind: "ready"; sessions: HostedSession[] };

// Sits above the public listing on the ISR-cached /sessions page -- fetched
// client-side after hydration so the page itself stays static (see
// app/api/sessions/hosted/route.ts). Renders nothing for anonymous visitors,
// members, or hosts with no non-finished sessions, so it never disturbs the
// page for the vast majority of visitors.
export function HostedSessionsPreview() {
  const t = useTranslations();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/sessions/hosted")
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          setState({ kind: "empty" });
          return;
        }
        const body: unknown = await response.json();
        if (!isHostedSessionsResponse(body) || !body.sessions || body.sessions.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        setState({ kind: "ready", sessions: body.sessions });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "empty" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind !== "ready") return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{t("sessionsList.hostedTitle")}</h2>
      <div className="flex flex-col gap-3">
        {state.sessions.map((session) => (
          <Card key={session.id} className="border-accent/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link href={`/sessions/${session.id}/manage`} className="hover:underline">
                  {session.title}
                </Link>
                <Badge variant="outline" className="capitalize">
                  {session.status}
                </Badge>
              </CardTitle>
              <CardDescription>
                {new Date(session.startsAt).toLocaleString()} · {session.location}
              </CardDescription>
            </CardHeader>
            <CardContent className="font-mono text-sm tabular-nums text-muted-foreground">
              {t("sessionCard.meta", {
                spots: session.maxParticipants,
                waitlist: session.waitlistCapacity,
                courts: session.courtCount,
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
