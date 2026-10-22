import type { Metadata } from "next";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getAbout } from "@/lib/dal/community-content";

// ISR, same as the other marketing pages: anon client only, no cookies.
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
  const [about, t] = await Promise.all([
    getAbout(locale),
    getTranslations({ locale, namespace: "about" }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      {about ? (
        <article className="flex flex-col gap-4">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-balance">
            {about.title}
          </h1>
          <p className="max-w-[65ch] whitespace-pre-wrap text-base leading-relaxed">{about.body}</p>
        </article>
      ) : (
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t("empty")}</p>
      )}

      <section className="flex flex-col items-start gap-3 rounded-lg border border-border/60 p-6">
        <h2 className="text-lg font-semibold tracking-tight">{t("ctaTitle")}</h2>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t("ctaBody")}</p>
        {/* /signup lives outside app/[locale] -- plain NextLink, no locale prefix */}
        <Button asChild>
          <NextLink href="/signup">{t("ctaButton")}</NextLink>
        </Button>
      </section>
    </div>
  );
}
