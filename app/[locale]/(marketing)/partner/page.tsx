import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CommunityStatsStrip } from "@/components/community-stats";
import { PageHero } from "@/components/marketing/page-hero";
import { PartnerInquiryForm } from "@/components/marketing/partner-inquiry-form";
import { PartnerOffers } from "@/components/marketing/partner-offers";
import { SocialIcon } from "@/components/marketing/social-icon";
import { shouldShowStats } from "@/lib/community-stats";
import { getCommunityStats } from "@/lib/dal/community-stats";
import { listVisibleSocialLinks } from "@/lib/dal/socials";
import { socialVerbKey } from "@/lib/socials/verb";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/partner">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partner" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: locale === "en" ? "/en/partner" : "/partner",
      languages: { id: "/partner", en: "/en/partner" },
    },
  };
}

export default async function PartnerPage({ params }: PageProps<"/[locale]/partner">) {
  const { locale } = await params;
  const [t, tSocials, stats, links] = await Promise.all([
    getTranslations({ locale, namespace: "partner" }),
    getTranslations({ locale, namespace: "socials" }),
    getCommunityStats(),
    listVisibleSocialLinks(),
  ]);

  return (
    <>
      <PageHero title={t("heroTitle")} subtitle={t("heroSubtitle")} />
      <PartnerOffers />
      {shouldShowStats(stats) ? <CommunityStatsStrip stats={stats} /> : null}
      <section className="px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight sm:text-5xl">
              {t("formTitle")}
            </h2>
            <p className="max-w-[52ch] text-base text-muted-foreground">{t("formIntro")}</p>
          </div>
          <PartnerInquiryForm />
        </div>
      </section>
      {links.length > 0 ? (
        <section className="px-6 pb-16">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-3xl font-extrabold uppercase italic leading-none tracking-tight sm:text-4xl">
                {t("directTitle")}
              </h2>
              <p className="max-w-[52ch] text-base text-muted-foreground">{t("directBody")}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {links.map((link) => (
                <li key={link.id} className="min-w-0">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center gap-3 rounded-2xl bg-sky-pale p-4 outline-none transition-colors hover:bg-sky-pale/70 focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    <SocialIcon platform={link.platform} className="size-6 shrink-0 text-navy" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-display text-lg font-bold leading-tight">
                        {link.label}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {tSocials(socialVerbKey(link.platform))}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
