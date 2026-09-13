import { notFound } from "next/navigation";
import { requireHost } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import { listRoster } from "@/lib/dal/participants";
import { RosterTable } from "@/components/sessions/roster-table";

export default async function ManageSessionPage({ params }: PageProps<"/sessions/[id]/manage">) {
  const { id } = await params;
  await requireHost(`/sessions/${id}/manage`);

  // Null means RLS did not return the row -- either it does not exist or the
  // caller does not host it. Both are a 404 here; distinguishing them would tell
  // a stranger that a private session exists.
  const session = await getHostSession(id);
  if (!session) notFound();

  const roster = await listRoster(id);
  const confirmed = roster.filter((entry) => entry.status === "confirmed").length;
  const waiting = roster.filter((entry) => entry.status === "waiting_list").length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{session.title}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(session.startsAt).toLocaleString()} · {session.location}
        </p>
        <p className="text-sm text-muted-foreground">
          {confirmed}/{session.maxParticipants} confirmed · {waiting}/{session.waitlistCapacity} waiting ·
          registration {session.registrationState}
        </p>
      </header>

      <RosterTable sessionId={session.id} entries={roster} />
    </div>
  );
}
