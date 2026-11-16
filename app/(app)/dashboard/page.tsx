import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle, SectionTitle } from "@/components/app/page-title";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmParticipationBanner } from "@/components/sessions/confirm-participation-banner";
import { MembershipCard } from "@/components/sessions/membership-card";
import { HostedSessionsList } from "@/components/sessions/hosted-sessions-list";
import { requireUser } from "@/lib/dal/user";
import { listMyUpcomingRegistrations } from "@/lib/dal/participants";
import { listMyHostedSessions } from "@/lib/dal/sessions";
import { getMyMemberships } from "@/lib/dal/memberships";
import { listMyAnnouncementsFeed } from "@/lib/dal/announcements";
import { formatDateTime } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [registrations, announcements, memberships] = await Promise.all([
    listMyUpcomingRegistrations(),
    listMyAnnouncementsFeed(),
    getMyMemberships(),
  ]);
  const hosted = user.role === "member" ? [] : await listMyHostedSessions();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <MembershipCard memberships={memberships} />

      <section className="flex flex-col gap-3">
        <PageTitle>Your upcoming sessions</PageTitle>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet.{" "}
            <Link href="/sessions" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline underline-offset-4">
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
                    <Link href={`/sessions/${row.sessionId}`} className="inline-flex min-h-11 items-center">{row.title}</Link>
                    {row.status === "confirmed" ? (
                      <Badge variant="success">Confirmed</Badge>
                    ) : (
                      <Badge variant="warning" className="tabular-nums">
                        Waitlist #{row.waitlistPosition}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {formatDateTime(row.startsAt)} · {row.location}
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

      {announcements.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Announcements</SectionTitle>
          <div className="flex flex-col gap-3">
            {announcements.map((announcement) => (
              <Card key={announcement.id}>
                <CardHeader>
                  <CardTitle>{announcement.title}</CardTitle>
                  <CardDescription>{formatDateTime(announcement.publishedAt)}</CardDescription>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{announcement.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {hosted.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Sessions you host</SectionTitle>
          <HostedSessionsList sessions={hosted} />
        </section>
      ) : null}
    </div>
  );
}
