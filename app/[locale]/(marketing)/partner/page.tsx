import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CommunityStatsStrip } from "@/components/community-stats";
import { PageHero } from "@/components/marketing/page-hero";
import { PartnerInquiryForm } from "@/components/marketing/partner-inquiry-form";
import { PartnerOffers } from "@/components/marketing/partner-offers";
import { SocialLinksSection } from "@/components/marketing/social-links-section";
import { shouldShowStats } from "@/lib/community-stats";
import { getCommunityStats } from "@/lib/dal/community-stats";
import { listVisibleSocialLinks } from "@/lib/dal/socials";

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
  const [t, stats, links] = await Promise.all([
    getTranslations({ locale, namespace: "partner" }),
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
      <SocialLinksSection
        links={links}
        title={t("directTitle")}
        body={t("directBody")}
        className="px-6 pb-16"
        titleClassName="text-3xl sm:text-4xl"
      />
    </>
  );
}
