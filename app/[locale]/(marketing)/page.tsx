import Image from "next/image";
import NextLink from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CommunityStatsStrip } from "@/components/community-stats";
import { FeaturedPostsCarousel } from "@/components/marketing/featured-posts-carousel";
import { PartnerCta } from "@/components/marketing/partner-cta";
import { SocialLinksSection } from "@/components/marketing/social-links-section";
import { CourtLines } from "@/components/marketing/court-lines";
import { Shuttlecock } from "@/components/marketing/shuttlecock";
import { SessionCard } from "@/components/sessions/session-card";
import { listPublicCommunityAnnouncements } from "@/lib/dal/announcements";
import { getCommunityStats } from "@/lib/dal/community-stats";
import { listLatestFeaturedPosts, listVisibleSocialLinks } from "@/lib/dal/socials";
import { listUpcomingPublicSessions } from "@/lib/dal/public-sessions";
import { shouldShowStats } from "@/lib/community-stats";

// Matches the sibling (marketing)/sessions/page.tsx revalidate window.
export const revalidate = 60;

const NEXT_SESSIONS = 2;

export default async function Home() {
  const [t, tAbout, tAnnouncements, locale, announcements, stats, sessions, featuredPosts, socialLinks] = await Promise.all([
    getTranslations("home"),
    getTranslations("about"),
    getTranslations("announcements"),
    getLocale(),
    listPublicCommunityAnnouncements(),
    getCommunityStats(),
    listUpcomingPublicSessions(),
    listLatestFeaturedPosts(),
    listVisibleSocialLinks(),
  ]);
  const featured = sessions[0] ?? null;
  const moreSessions = sessions.slice(1, 1 + NEXT_SESSIONS);
  const featuredOpen = featured?.registrationState === "open";
  const featuredDate = featured
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(featured.startsAt))
    : "";

  return (
    <>
      <section className="court-field relative isolate overflow-hidden text-white">
        <CourtLines className="absolute inset-0 -z-10 size-full text-white/20" />
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-6 py-8 md:grid-cols-[1fr_1fr] md:py-16">
          <div className="flex flex-col gap-5 md:gap-6">
            <h1 className="font-display text-[clamp(2.75rem,8vw,5rem)] font-extrabold uppercase italic leading-[0.9] tracking-tight text-balance">
              {t("title")}
            </h1>
            <p className="max-w-[42ch] text-lg text-white">{t("subtitle")}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                asChild
                size="lg"
                className="bg-cork text-navy shadow-bar hover:bg-cork/90 focus-visible:ring-white"
              >
                {featured && featuredOpen ? (
                  <Link href={`/sessions/${featured.id}`}>{t("ctaRegister", { date: featuredDate })}</Link>
                ) : (
                  <Link href="/sessions">{t("ctaBrowse")}</Link>
                )}
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
            <p className="text-sm font-semibold text-white">{t("kicker")}</p>
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
            {featured ? (
              <div className="shadow-float rounded-2xl text-foreground">
                <SessionCard session={featured} headingLevel="h2" large />
              </div>
            ) : (
              <Image
                src="/brand/jakbar-twogether.jpeg"
                alt="Jakbar Twogether"
                width={640}
                height={640}
                priority
                sizes="(min-width: 768px) 400px, 90vw"
                className="aspect-square w-full rotate-3 rounded-[2rem] border-4 border-white object-cover shadow-float"
              />
            )}
          </div>
        </div>
      </section>

      {sessions.length === 0 ? (
        <section className="py-16">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6">
            <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
              {t("runningTitle")}
            </h2>
            <p className="max-w-[52ch] rounded-2xl border-2 border-dashed border-input p-5 text-base text-muted-foreground">
              {t("runningEmpty")}
            </p>
          </div>
        </section>
      ) : null}

      {moreSessions.length > 0 ? (
        <section className="py-16">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6">
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
                {t("runningTitle")}
              </h2>
              <p className="max-w-[52ch] text-base text-muted-foreground">{t("runningBody")}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {moreSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
            <Button asChild variant="outline" size="lg" className="w-fit border-2 border-navy">
              <Link href="/sessions">{t("runningLink")}</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="bg-sky-pale py-16">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
              {t("howTitle")}
            </h2>
            <p className="max-w-[52ch] text-base">{t("howBody")}</p>
          </div>
          <ol className="grid gap-6 md:grid-cols-3 md:gap-0">
            {([1, 2, 3] as const).map((n) => (
              <li
                key={n}
                className="flex gap-4 border-navy/25 md:flex-col md:gap-3 md:px-6 md:first:pl-0 md:last:pr-0 md:[&:not(:first-child)]:border-l-2 md:[&:not(:first-child)]:border-dashed"
              >
                <span aria-hidden="true" className="font-display text-6xl font-extrabold italic leading-none text-sky-deep tabular-nums">
                  {n}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-2xl font-bold leading-tight">{t(`step${n}Title`)}</h3>
                  <p className="text-base">{t(`step${n}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/faq" className="inline-flex min-h-11 w-fit items-center font-semibold text-accent-text underline underline-offset-4">
            {t("faqLink")}
          </Link>
        </div>
      </section>

      {shouldShowStats(stats) ? <CommunityStatsStrip stats={stats} /> : null}

      <FeaturedPostsCarousel posts={featuredPosts} locale={locale} />

      {announcements.length > 0 ? (
        <section className="py-16">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6">
            <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
              {tAnnouncements("title")}
            </h2>
            <div className={`grid gap-4 ${announcements.length > 1 ? "md:grid-cols-2" : ""}`}>
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

      <SocialLinksSection links={socialLinks} title={t("socialsTitle")} body={t("socialsBody")} />

      <section className="relative isolate overflow-hidden bg-cork py-14 text-navy">
        <CourtLines className="absolute inset-0 -z-10 size-full text-navy/10" />
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6">
          <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
            {tAbout("ctaTitle")}
          </h2>
          <p className="max-w-[52ch] text-base">{tAbout("ctaBody")}</p>
          <Button asChild size="lg">
            <NextLink href="/signup">{t("ctaCreateAccount")}</NextLink>
          </Button>
        </div>
      </section>

      <PartnerCta />
    </>
  );
}
