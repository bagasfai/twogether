import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listFaqItems } from "@/lib/dal/community-content";
import { faqJsonLd } from "@/lib/community-content/json-ld";

// Inert while the marketing layout reads cookies (getCurrentUser), same as
// gallery: the page renders dynamically. Kept per spec.
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-balance">
        {t("title")}
      </h1>

      {items.length === 0 ? (
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {items.map((item) => (
              <details key={item.id} className="group">
                <summary className="flex min-h-11 cursor-pointer items-center py-2 text-base font-medium">
                  {item.question}
                </summary>
                <p className="max-w-[65ch] whitespace-pre-wrap pb-4 text-sm leading-relaxed text-muted-foreground">
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
  );
}
