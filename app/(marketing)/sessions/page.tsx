import type { Metadata } from "next";
import { listUpcomingPublicSessions } from "@/lib/dal/public-sessions";
import { SessionCard } from "@/components/sessions/session-card";

// ISR. This route must never import lib/supabase/server -- touching cookies()
// would make it dynamic and forfeit the caching this route group exists for.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Upcoming sessions — Jakbar Twogether",
  description: "Badminton sessions open for registration in West Jakarta.",
};

export default async function SessionsPage() {
  const sessions = await listUpcomingPublicSessions();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Upcoming sessions</h1>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions scheduled right now.</p>
      ) : (
        sessions.map((session) => <SessionCard key={session.id} session={session} />)
      )}
    </div>
  );
}
