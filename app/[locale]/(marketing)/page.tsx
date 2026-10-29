import Image from "next/image";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CommunityStatsStrip } from "@/components/community-stats";
import { CourtLines } from "@/components/marketing/court-lines";
import { Shuttlecock } from "@/components/marketing/shuttlecock";
import { SessionCard } from "@/components/sessions/session-card";
import { listPublicCommunityAnnouncements } from "@/lib/dal/announcements";
import { getCommunityStats } from "@/lib/dal/community-stats";
import { listUpcomingPublicSessions } from "@/lib/dal/public-sessions";
import { shouldShowStats } from "@/lib/community-stats";

// This page previously did no data fetching. `revalidate` is set here for
// when/if this route group stops being forced dynamic (currently
// (marketing)/layout.tsx's getCurrentUser() call forces every page in this
// group to render dynamically regardless of this value) -- matches the
// sibling (marketing)/sessions/page.tsx's value so both are consistent if
// that ever changes.
export const revalidate = 60;

const NEXT_SESSIONS = 3;

export default async function Home() {
  const [t, tAbout, tAnnouncements, announcements, stats, sessions] = await Promise.all([
    getTranslations("home"),
    getTranslations("about"),
    getTranslations("announcements"),
    listPublicCommunityAnnouncements(),
    getCommunityStats(),
    listUpcomingPublicSessions(),
  ]);
  const nextSessions = sessions.slice(0, NEXT_SESSIONS);

  return (
    <>
      <section className="court-field relative isolate overflow-hidden text-white">
        <CourtLines className="absolute inset-0 -z-10 size-full text-white/20" />
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-6 py-12 md:grid-cols-[1.25fr_1fr] md:py-20">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-[clamp(3rem,9vw,6rem)] font-extrabold uppercase italic leading-[0.9] tracking-tight text-balance">
              {t("title")}
            </h1>
            <p className="max-w-[42ch] text-lg text-white">{t("subtitle")}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                asChild
                size="lg"
                className="bg-cork text-navy shadow-[0_6px_16px_-6px_oklch(28%_0.13_264/0.6)] hover:bg-cork/90 focus-visible:ring-white"
              >
                <Link href="/sessions">{t("ctaBrowse")}</Link>
              </Button>
              {/* /signup lives outside app/[locale] -- plain Link, no locale prefix */}
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-2 border-white bg-transparent text-white shadow-none hover:bg-white hover:text-navy focus-visible:ring-white"
              >
                <NextLink href="/signup">{t("ctaJoin")}</NextLink>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm md:max-w-none">
            <Shuttlecock
              className="shuttle-drift absolute -left-6 -top-8 z-10 w-14 sm:w-16"
              style={{ ["--shuttle-from" as string]: "-30deg", ["--shuttle-to" as string]: "-14deg", ["--shuttle-delay" as string]: "120ms" }}
            />
            <Shuttlecock
              className="shuttle-drift absolute -bottom-6 -right-4 z-10 w-12 sm:w-14"
              style={{ ["--shuttle-from" as string]: "40deg", ["--shuttle-to" as string]: "24deg", ["--shuttle-delay" as string]: "260ms" }}
            />
            <Image
              src="/brand/jakbar-twogether.jpeg"
              alt="Jakbar Twogether"
              width={640}
              height={640}
              priority
              sizes="(min-width: 768px) 400px, 90vw"
              className="aspect-square w-full rotate-3 rounded-[2rem] border-4 border-white object-cover shadow-[0_24px_48px_-16px_oklch(20%_0.13_264/0.7)]"
            />
            <p className="absolute -bottom-4 left-4 z-10 -rotate-2 rounded-full bg-cork px-4 py-1.5 text-sm font-bold text-navy shadow-md">
              {t("kicker")}
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
              {t("runningTitle")}
            </h2>
            <p className="max-w-[52ch] text-base text-muted-foreground">{t("runningBody")}</p>
          </div>
          {nextSessions.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-1">
              {nextSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : null}
          <Button asChild variant="outline" size="lg" className="w-fit border-2 border-navy">
            <Link href="/sessions">{t("runningLink")}</Link>
          </Button>
        </div>
      </section>

      {shouldShowStats(stats) ? <CommunityStatsStrip stats={stats} /> : null}

      {announcements.length > 0 ? (
        <section className="px-6 py-16">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
              {tAnnouncements("title")}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="flex flex-col gap-2 rounded-2xl bg-sky-pale p-5"
                >
                  <p className="font-display text-xl font-bold leading-tight">{announcement.title}</p>
                  <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="relative isolate overflow-hidden bg-cork py-14 text-navy">
        <CourtLines className="absolute inset-0 -z-10 size-full text-navy/10" />
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6">
          <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
            {tAbout("ctaTitle")}
          </h2>
          <p className="max-w-[52ch] text-base">{tAbout("ctaBody")}</p>
          <Button asChild size="lg">
            <NextLink href="/signup">{t("ctaJoin")}</NextLink>
          </Button>
        </div>
      </section>
    </>
  );
}
