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
import { SessionRealtimeWatcher } from "@/components/sessions/session-realtime-watcher";

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
  const confirmed = roster.filter((entry) => entry.status === "confirmed").length;
  const waiting = roster.filter((entry) => entry.status === "waiting_list").length;
  const checkedIn = roster.filter((entry) => entry.checkedInAt !== null).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <SessionRealtimeWatcher sessionId={session.id} />

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{session.title}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(session.startsAt).toLocaleString()} · {session.location}
        </p>
        <p className="text-sm text-muted-foreground">
          {confirmed}/{session.maxParticipants} confirmed · {waiting}/{session.waitlistCapacity} waiting ·
          {checkedIn} checked in · registration {session.registrationState}
        </p>
      </header>

      <CourtPanel sessionId={session.id} courts={courts} courtCount={session.courtCount} />

      <MatchPanel sessionId={session.id} matches={matches} courts={courts} rotationQueue={rotationQueue} />

      <RosterTable sessionId={session.id} entries={roster} />
    </div>
  );
}
