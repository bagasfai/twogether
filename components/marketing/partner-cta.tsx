import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export async function PartnerCta() {
  const t = await getTranslations("home");
  return (
    <section className="border-t-2 border-border py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex max-w-[60ch] flex-col gap-1">
          <h2 className="font-display text-2xl font-bold leading-tight text-balance">{t("partnerCtaTitle")}</h2>
          <p className="text-base text-muted-foreground">{t("partnerCtaBody")}</p>
        </div>
        <Button asChild variant="outline" size="lg" className="w-fit shrink-0 border-2 border-navy">
          <Link href="/partner">{t("partnerCtaButton")}</Link>
        </Button>
      </div>
    </section>
  );
}
