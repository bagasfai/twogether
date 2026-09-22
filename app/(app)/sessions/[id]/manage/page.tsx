import { notFound } from "next/navigation";
import { requireHost } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import { listRoster } from "@/lib/dal/participants";
import { listCourts } from "@/lib/dal/courts";
import { listMatches } from "@/lib/dal/matches";
import { getRotationQueue } from "@/lib/dal/rotation";
import { RosterTable } from "@/components/sessions/roster-table";
import { CourtPanel } from "@/components/sessions/court-panel";
import { MatchPanel } from "@/components/sessions/match-panel";
import { ManageTabs } from "@/components/sessions/manage-tabs";
import { SessionRealtimeWatcher } from "@/components/sessions/session-realtime-watcher";
import { SessionActionsMenu } from "@/components/sessions/session-actions-menu";
import { Badge } from "@/components/ui/badge";
import { listHostAnnouncements } from "@/lib/dal/announcements";
import { AnnouncementList } from "@/components/sessions/announcement-list";

export default async function ManageSessionPage({ params }: PageProps<"/sessions/[id]/manage">) {
  const { id } = await params;
  await requireHost(`/sessions/${id}/manage`);

  // Null means RLS did not return the row -- either it does not exist or the
  // caller does not host it. Both are a 404 here; distinguishing them would tell
  // a stranger that a private session exists.
  const session = await getHostSession(id);
  if (!session) notFound();

  const roster = await listRoster(id);
  const courts = await listCourts(id);
  const matches = await listMatches(id);
  const rotationQueue = await getRotationQueue(id);
  const announcements = await listHostAnnouncements(id);
  const confirmed = roster.filter((entry) => entry.status === "confirmed").length;
  const waiting = roster.filter((entry) => entry.status === "waiting_list").length;
  const checkedIn = roster.filter((entry) => entry.checkedInAt !== null).length;
  const activeMatches = matches.filter((m) => m.status !== "cancelled").length;

  return (
    <div className="flex flex-col gap-4 sm:gap-6 lg:mx-auto lg:max-w-6xl">
      <SessionRealtimeWatcher sessionId={session.id} />

      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{session.title}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(session.startsAt).toLocaleString()} · {session.location}
          </p>
        </div>
        <SessionActionsMenu session={session} showManageLink={false} />
      </header>

      {/* Sticky so confirmed/waiting/checked-in counts stay visible while
          the host scrolls through courts/matches/roster on a phone. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />
          Live
        </span>
        <Badge variant="success" className="font-mono text-xs tabular-nums sm:text-sm">
          {confirmed}/{session.maxParticipants} confirmed
        </Badge>
        <Badge variant="warning" className="font-mono text-xs tabular-nums sm:text-sm">
          {waiting}/{session.waitlistCapacity} waiting
        </Badge>
        {/* Checked-in is a distinct pool from registration status (courts/matches/
            rotation read from it, not the roster) -- accent-outline keeps it
            visually separate from the confirmed/waiting registration badges. */}
        <Badge variant="outline" className="font-mono text-xs tabular-nums text-accent sm:text-sm">
          {checkedIn} checked in
        </Badge>
        <Badge variant="outline" className="text-xs capitalize sm:text-sm">
          {session.registrationState}
        </Badge>
      </div>

      <AnnouncementList sessionId={id} announcements={announcements} />

      <ManageTabs
        courtCount={courts.length}
        matchCount={activeMatches}
        rosterCount={roster.length}
        courts={<CourtPanel sessionId={session.id} courts={courts} courtCount={session.courtCount} />}
        matches={
          <MatchPanel sessionId={session.id} matches={matches} courts={courts} rotationQueue={rotationQueue} />
        }
        roster={<RosterTable sessionId={session.id} entries={roster} />}
      />
    </div>
  );
}
