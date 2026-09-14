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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Upcoming sessions</h1>
        <p className="text-sm text-muted-foreground">
          Open registration, waitlist status, and courts — all in one place.
        </p>
      </header>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions scheduled right now.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
