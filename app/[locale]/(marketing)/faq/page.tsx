import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHero } from "@/components/marketing/page-hero";
import { listFaqItems } from "@/lib/dal/community-content";
import { faqJsonLd } from "@/lib/community-content/json-ld";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/faq">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faq" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: locale === "en" ? "/en/faq" : "/faq",
      languages: { id: "/faq", en: "/en/faq" },
    },
  };
}

export default async function FaqPage({ params }: PageProps<"/[locale]/faq">) {
  const { locale } = await params;
  const [items, t] = await Promise.all([
    listFaqItems(locale),
    getTranslations({ locale, namespace: "faq" }),
  ]);

  return (
    <>
      <PageHero title={t("title")} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        {items.length === 0 ? (
          <p className="max-w-[65ch] text-base text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <details
                  key={item.id}
                  className="disclosure group rounded-2xl border-2 border-border bg-card transition-colors duration-[var(--dur-short)] open:border-navy"
                >
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 font-display text-xl font-bold leading-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-pale text-navy transition-transform duration-[var(--dur-short)] ease-[var(--ease-out)] group-open:rotate-180 motion-reduce:transition-none"
                    >
                      <ChevronDown className="size-4" />
                    </span>
                  </summary>
                  <p className="max-w-[65ch] whitespace-pre-wrap px-5 pb-5 text-base leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: faqJsonLd(items) }}
            />
          </>
        )}
      </div>
    </>
  );
}
