import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/dal/user";
import { listMyUpcomingRegistrations } from "@/lib/dal/participants";
import { listMyHostedSessions } from "@/lib/dal/sessions";

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const registrations = await listMyUpcomingRegistrations();
  const hosted = user.role === "member" ? [] : await listMyHostedSessions();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Your upcoming sessions</h1>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. <Link href="/sessions" className="underline">Browse sessions</Link>.
          </p>
        ) : (
          registrations.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link href={`/sessions/${row.sessionId}`}>{row.title}</Link>
                  {row.status === "confirmed" ? (
                    <Badge>Confirmed</Badge>
                  ) : (
                    <Badge variant="secondary">Waitlist #{row.waitlistPosition}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {new Date(row.startsAt).toLocaleString()} · {row.location}
                </CardDescription>
              </CardHeader>
            </Card>
          ))
        )}
      </section>

      {hosted.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Sessions you host</h2>
          {hosted.map((session) => (
            <Card key={session.id}>
              <CardHeader>
                <CardTitle>
                  <Link href={`/sessions/${session.id}/manage`}>{session.title}</Link>
                </CardTitle>
                <CardDescription>
                  {new Date(session.startsAt).toLocaleString()} · {session.location} ·{" "}
                  {session.status} · registration {session.registrationState}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Capacity {session.maxParticipants} · waitlist {session.waitlistCapacity}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
