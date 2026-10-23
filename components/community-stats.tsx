import { getLocale, getTranslations } from "next-intl/server";
import { shouldShowStats, type CommunityStats } from "@/lib/community-stats";

export async function CommunityStatsStrip({ stats }: { stats: CommunityStats }) {
  if (!shouldShowStats(stats)) return null;

  const [t, locale] = await Promise.all([getTranslations("home.stats"), getLocale()]);

  const tiles = [
    { key: "sessionsHeld", value: stats.sessionsHeld },
    { key: "matchesPlayed", value: stats.matchesPlayed },
    { key: "totalCheckins", value: stats.totalCheckins },
    { key: "activeMembers", value: stats.activeMembers },
  ] as const;

  return (
    <section className="px-6 py-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("title")}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(({ key, value }) => (
            <div key={key} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
              <dd className="text-3xl font-semibold tabular-nums">{value.toLocaleString(locale)}</dd>
              <dt className="text-sm text-muted-foreground">{t(key)}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
