import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function MarketingNotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-16">
      <h1 className="font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight">{t("title")}</h1>
      <p className="text-base text-muted-foreground">{t("body")}</p>
      <Button asChild>
        <Link href="/">{t("home")}</Link>
      </Button>
    </div>
  );
}
