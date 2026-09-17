import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listUpcomingPublicSessions } from "@/lib/dal/public-sessions";
import { SessionCard } from "@/components/sessions/session-card";
import { HostedSessionsPreview } from "@/components/sessions/hosted-sessions-preview";

// ISR. This route must never import lib/supabase/server -- touching cookies()
// would make it dynamic and forfeit the caching this route group exists for.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sessionsList");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function SessionsPage() {
  const [sessions, t] = await Promise.all([
    listUpcomingPublicSessions(),
    getTranslations("sessionsList"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <HostedSessionsPreview />
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
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
