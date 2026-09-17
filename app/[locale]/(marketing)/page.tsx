import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function Home() {
  const t = useTranslations("home");

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
    </>
  );
}
