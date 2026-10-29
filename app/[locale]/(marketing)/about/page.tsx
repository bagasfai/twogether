import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { getAbout } from "@/lib/dal/community-content";

// Inert while the marketing layout reads cookies (getCurrentUser), same as
// gallery: the page renders dynamically. Kept per spec.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // localePrefix is "as-needed": id is unprefixed, en lives under /en.
    alternates: {
      canonical: locale === "en" ? "/en/about" : "/about",
      languages: { id: "/about", en: "/en/about" },
    },
  };
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  const [about, t, tNav] = await Promise.all([
    getAbout(locale),
    getTranslations({ locale, namespace: "about" }),
    getTranslations({ locale, namespace: "nav" }),
  ]);

  return (
    <>
      <PageHero title={about ? about.title : tNav("about")} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
        {about ? (
          <article>
            <p className="max-w-[65ch] whitespace-pre-wrap text-lg leading-relaxed">{about.body}</p>
          </article>
        ) : (
          <p className="max-w-[65ch] text-base text-muted-foreground">{t("empty")}</p>
        )}

        <section className="flex flex-col items-start gap-3 rounded-3xl bg-cork p-6 text-navy sm:p-8">
          <h2 className="font-display text-3xl font-extrabold uppercase italic leading-none tracking-tight">
            {t("ctaTitle")}
          </h2>
          <p className="max-w-[65ch] text-base">{t("ctaBody")}</p>
          {/* /signup lives outside app/[locale] -- plain NextLink, no locale prefix */}
          <Button asChild size="lg">
            <NextLink href="/signup">{t("ctaButton")}</NextLink>
          </Button>
        </section>
      </div>
    </>
  );
}
