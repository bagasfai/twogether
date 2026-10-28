import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/dal/user";
import {
  listMyPastRegistrations,
  listMyPastGuestRegistrations,
} from "@/lib/dal/participants";
import { formatDateTime } from "@/lib/format/datetime";

export default async function HistoryPage() {
  await requireUser("/history");
  const [registrations, guestRegistrations] = await Promise.all([
    listMyPastRegistrations(),
    listMyPastGuestRegistrations(),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Your session history</h1>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No past sessions yet.{" "}
            <Link href="/sessions" className="font-medium text-accent-text hover:underline">
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
                      <Badge variant="warning">Waitlisted</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {formatDateTime(row.startsAt)} · {row.location}
                    {" · "}
                    <Link href={`/sessions/${row.sessionId}/matches`} className="font-medium text-accent-text hover:underline">
                      Matches
                    </Link>
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      {guestRegistrations.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Guests you brought</h2>
          <div className="flex flex-col gap-3">
            {guestRegistrations.map((row) => (
              <Card key={row.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link href={`/sessions/${row.sessionId}`}>{row.title}</Link>
                    {row.status === "confirmed" ? (
                      <Badge variant="success">Confirmed</Badge>
                    ) : (
                      <Badge variant="warning">Waitlisted</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {row.guestName} · {formatDateTime(row.startsAt)}
                    {" · "}
                    <Link href={`/sessions/${row.sessionId}/matches`} className="font-medium text-accent-text hover:underline">
                      Matches
                    </Link>
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
