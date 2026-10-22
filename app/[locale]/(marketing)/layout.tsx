import type { ReactNode } from "react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getCurrentUser } from "@/lib/dal/user";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations()]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Below sm, brand + login share the first row and the nav links +
            language switcher drop to a second row, so a 320px viewport never
            scrolls horizontally. From sm up it is the original single row. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <Link href="/" className="mr-auto whitespace-nowrap text-base font-semibold tracking-tight sm:mr-0">
            {t("nav.brand")}
          </Link>
          <div className="order-last flex basis-full items-center gap-4 sm:order-none sm:gap-6 sm:flex-1 sm:basis-auto">
            <nav className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:gap-x-6 text-muted-foreground">
              <Link href="/sessions" className="whitespace-nowrap transition-colors hover:text-foreground">
                {t("nav.sessions")}
              </Link>
              <Link href="/gallery" className="whitespace-nowrap transition-colors hover:text-foreground">
                {t("nav.gallery")}
              </Link>
              <Link href="/about" className="whitespace-nowrap transition-colors hover:text-foreground">
                {t("nav.about")}
              </Link>
              <Link href="/faq" className="whitespace-nowrap transition-colors hover:text-foreground">
                {t("nav.faq")}
              </Link>
            </nav>
            <LanguageSwitcher />
          </div>
          {/* /dashboard and /login live outside app/[locale] -- plain Link, no locale prefix */}
          <Button asChild size="sm" variant={user ? "default" : "outline"}>
            <NextLink href={user ? "/dashboard" : "/login"}>
              {user ? t("nav.dashboard") : t("nav.login")}
            </NextLink>
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground">
          <span>{t("nav.brand")}</span>
          <span>{t("footer.tagline")}</span>
          <span className="flex items-center gap-4">
            <Link href="/about" className="transition-colors hover:text-foreground">
              {t("nav.about")}
            </Link>
            <Link href="/faq" className="transition-colors hover:text-foreground">
              {t("nav.faq")}
            </Link>
          </span>
          <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
        </div>
      </footer>
    </div>
  );
}
