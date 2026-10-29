import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export async function PartnerCta() {
  const t = await getTranslations("home");
  return (
    <section className="bg-navy py-14 text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6">
        <h2 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight text-balance sm:text-5xl">
          {t("partnerCtaTitle")}
        </h2>
        <p className="max-w-[52ch] text-base">{t("partnerCtaBody")}</p>
        <Button
          asChild
          size="lg"
          className="bg-cork text-navy hover:bg-cork/90 focus-visible:ring-white"
        >
          <Link href="/partner">{t("partnerCtaButton")}</Link>
        </Button>
      </div>
    </section>
  );
}
