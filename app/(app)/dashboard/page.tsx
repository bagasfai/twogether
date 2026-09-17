import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmParticipationBanner } from "@/components/sessions/confirm-participation-banner";
import { SessionActionsMenu } from "@/components/sessions/session-actions-menu";
import { requireUser } from "@/lib/dal/user";
import { listMyUpcomingRegistrations } from "@/lib/dal/participants";
import { listMyHostedSessions } from "@/lib/dal/sessions";

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const registrations = await listMyUpcomingRegistrations();
  const hosted = user.role === "member" ? [] : await listMyHostedSessions();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Your upcoming sessions</h1>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet.{" "}
            <Link href="/sessions" className="font-medium text-accent hover:underline">
              Browse sessions
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {registrations.map((row) => (
              <Card key={row.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link href={`/sessions/${row.sessionId}`}>{row.title}</Link>
                    {row.status === "confirmed" ? (
                      <Badge variant="success">Confirmed</Badge>
                    ) : (
                      <Badge variant="warning" className="font-mono tabular-nums">
                        Waitlist #{row.waitlistPosition}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {new Date(row.startsAt).toLocaleString()} · {row.location}
                  </CardDescription>
                </CardHeader>
                {row.needsConfirmation ? (
                  <CardContent>
                    <ConfirmParticipationBanner sessionId={row.sessionId} title={row.title} />
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      {hosted.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Sessions you host</h2>
          <div className="flex flex-col gap-3">
            {hosted.map((session) => (
              <Card key={session.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>
                      <Link href={`/sessions/${session.id}/manage`}>{session.title}</Link>
                    </CardTitle>
                    <SessionActionsMenu session={session} />
                  </div>
                  <CardDescription>
                    {new Date(session.startsAt).toLocaleString()} · {session.location} ·{" "}
                    {session.status} · registration {session.registrationState}
                  </CardDescription>
                </CardHeader>
                <CardContent className="font-mono text-sm tabular-nums text-muted-foreground">
                  {session.maxParticipants} capacity · {session.waitlistCapacity} waitlist
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
