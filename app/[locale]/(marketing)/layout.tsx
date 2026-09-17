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
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/" className="text-base font-semibold tracking-tight">
            {t("nav.brand")}
          </Link>
          <nav className="flex flex-1 items-center gap-6 text-sm text-muted-foreground">
            <Link href="/sessions" className="transition-colors hover:text-foreground">
              {t("nav.sessions")}
            </Link>
          </nav>
          <LanguageSwitcher />
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
          <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
        </div>
      </footer>
    </div>
  );
}
