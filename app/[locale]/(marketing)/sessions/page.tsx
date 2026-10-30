import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listUpcomingPublicSessions } from "@/lib/dal/public-sessions";
import { PageHero } from "@/components/marketing/page-hero";
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
    <>
      <PageHero title={t("title")} subtitle={t("subtitle")} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <HostedSessionsPreview />
        {sessions.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-input p-6 text-base text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
