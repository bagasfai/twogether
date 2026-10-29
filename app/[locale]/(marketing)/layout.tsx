import type { ReactNode } from "react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AccountButton } from "@/components/nav/account-button";
import { SkipLink } from "@/components/skip-link";
import { NavLinks } from "@/components/nav/nav-links";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Locale passed explicitly: with no argument next-intl reads request headers,
  // which would make every page in this group dynamic.
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  return (
    <div className="flex flex-1 flex-col">
      <SkipLink />
      <header className="sticky top-0 z-20 bg-navy text-white">
        {/* Below sm, brand + login share the first row and the nav links +
            language switcher drop to a second row, so a 320px viewport never
            scrolls horizontally. From sm up it is a single row. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link
            href="/"
            className="mr-auto flex items-center gap-3 whitespace-nowrap rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-white sm:mr-0"
          >
            <Image
              src="/brand/jakbar-twogether.jpeg"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full border-2 border-white object-cover"
            />
            <span className="font-display text-xl font-extrabold uppercase italic tracking-tight">
              {t("nav.brand")}
            </span>
          </Link>
          <div className="order-last flex basis-full items-center gap-4 sm:order-none sm:flex-1 sm:basis-auto sm:gap-6">
            <NavLinks
              localized
              items={[
                { href: "/sessions", label: t("nav.sessions") },
                { href: "/gallery", label: t("nav.gallery") },
                { href: "/about", label: t("nav.about") },
                { href: "/faq", label: t("nav.faq") },
              ]}
              className="flex flex-1 flex-wrap items-center gap-1 text-sm"
              linkClassName="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-white outline-none transition-colors duration-[var(--dur-micro)] hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-white max-md:min-h-11"
              activeClassName="bg-cork text-navy hover:bg-cork"
            />
            <LanguageSwitcher />
          </div>
          <AccountButton loginLabel={t("nav.login")} dashboardLabel={t("nav.dashboard")} />
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col">{children}</main>
      <footer className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/brand/jakbar-twogether.jpeg"
              alt=""
              width={64}
              height={64}
              className="size-16 -rotate-3 rounded-2xl border-2 border-white object-cover"
            />
            <div className="flex flex-col">
              <span className="font-display text-2xl font-extrabold uppercase italic leading-none tracking-tight">
                {t("nav.brand")}
              </span>
              <span className="mt-1 text-sm text-white/80">{t("footer.tagline")}</span>
            </div>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            {(
              [
                ["/sessions", t("nav.sessions")],
                ["/gallery", t("nav.gallery")],
                ["/about", t("nav.about")],
                ["/faq", t("nav.faq")],
              ] as const
            ).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-11 items-center rounded-sm text-white/90 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-[3px] focus-visible:ring-white"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-white/15">
          <p className="mx-auto max-w-5xl px-6 py-4 text-xs text-white/80">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
