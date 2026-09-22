import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { listPublicCommunityAnnouncements } from "@/lib/dal/announcements";

// This page previously did no data fetching at all. Matches
// (marketing)/sessions/page.tsx's existing revalidate value so this page
// keeps ISR caching instead of becoming fully dynamic now that it reads
// from the database.
export const revalidate = 60;

export default async function Home() {
  const t = useTranslations("home");
  const tAnnouncements = useTranslations("announcements");
  const announcements = await listPublicCommunityAnnouncements();

  return (
    <>
      <section className="flex flex-1 flex-col justify-center px-6 py-20 md:py-28">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <p className="text-sm font-medium text-accent">{t("kicker")}</p>
          <h1 className="text-[clamp(2.5rem,4vw+1rem,4.25rem)] font-semibold leading-[1.05] tracking-tight text-balance">
            {t("title")}
          </h1>
          <p className="max-w-[42ch] text-lg text-muted-foreground">{t("subtitle")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg">
              <Link href="/sessions">{t("ctaBrowse")}</Link>
            </Button>
            {/* /signup lives outside app/[locale] -- plain Link, no locale prefix */}
            <Button asChild size="lg" variant="outline">
              <NextLink href="/signup">{t("ctaJoin")}</NextLink>
            </Button>
          </div>
        </div>
      </section>

      <hr className="border-t-2 border-border" />

      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("runningTitle")}</h2>
          <p className="max-w-[52ch] text-base">
            {t("runningBody")}{" "}
            <Link href="/sessions" className="font-medium text-accent hover:underline">
              {t("runningLink")}
            </Link>
          </p>
        </div>
      </section>

      {announcements.length > 0 ? (
        <>
          <hr className="border-t-2 border-border" />

          <section className="px-6 py-16">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">{tAnnouncements("title")}</h2>
              <div className="flex flex-col gap-3">
                {announcements.map((announcement) => (
                  <div key={announcement.id} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
                    <p className="text-sm font-medium">{announcement.title}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{announcement.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
