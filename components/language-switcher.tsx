"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// Segmented switch on the navy header: the current language is solid cork,
// the other is outlined. aria-pressed carries the state for assistive tech.
export function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 p-1 text-sm">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          aria-pressed={loc === locale}
          onClick={() => router.replace(pathname, { locale: loc })}
          className={cn(
            "rounded-full px-3 py-1 font-medium uppercase outline-none transition-colors duration-[var(--dur-micro)] focus-visible:ring-[3px] focus-visible:ring-white max-md:min-h-11",
            loc === locale ? "bg-cork text-navy" : "text-white hover:bg-white/15",
          )}
        >
          {t(loc)}
        </button>
      ))}
    </div>
  );
}
