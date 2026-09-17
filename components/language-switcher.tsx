"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 text-sm">
      {routing.locales.map((loc) => (
        <Button
          key={loc}
          size="sm"
          variant={loc === locale ? "default" : "ghost"}
          onClick={() => router.replace(pathname, { locale: loc })}
        >
          {t(loc)}
        </Button>
      ))}
    </div>
  );
}
