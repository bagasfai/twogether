import { getLocale, getTranslations } from "next-intl/server";
import { shouldShowStats, type CommunityStats } from "@/lib/community-stats";

// Scoreboard band: real counts only (shouldShowStats hides it until they mean
// something). Navy panel, display numerals, no invented figures.
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
    <section className="bg-navy py-12 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6">
        <h2 className="font-display text-3xl font-extrabold uppercase italic tracking-tight">{t("title")}</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/20 sm:grid-cols-4">
          {tiles.map(({ key, value }) => (
            // dt before dd is the valid DOM order (screen readers announce the
            // term, then its value); flex-col-reverse keeps the number on top.
            <div key={key} className="flex flex-col-reverse justify-end gap-1 bg-navy p-5">
              <dt className="text-sm text-white/85">{t(key)}</dt>
              <dd className="font-display text-5xl font-extrabold italic leading-none tabular-nums text-cork">
                {value.toLocaleString(locale)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
