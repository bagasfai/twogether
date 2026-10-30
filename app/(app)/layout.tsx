import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { House } from "lucide-react";
import { requireUser } from "@/lib/dal/user";
import { SkipLink } from "@/components/skip-link";
import { NavLinks } from "@/components/nav/nav-links";
import { SignOutButton } from "@/components/auth/sign-out-button";

// LayoutProps<"/"> would be wrong here even though it type-checks: Next's
// typegen only emits a route literal for a layout.tsx that sits directly on
// that route, and "/" belongs to (marketing)/page.tsx, not this group. This
// layout applies to every route under (app), so no single route literal fits
// -- a plain children prop is the honest type.
export default async function AppLayout({ children }: { children: ReactNode }) {
  // The proxy already redirected an anonymous visitor; this is the real check,
  // and it also covers a session that expires in the narrow window between the
  // proxy's cookie-only check and this render.
  //
  // The redirect target is hardcoded to "/dashboard" rather than the page the
  // user was actually headed to: a layout has no server-side way to read the
  // current pathname (no params for it, and reaching for request headers here
  // would be reading proxy internals this file has no business depending on).
  // Every (app) page already calls requireUser(<its own path>) as the primary,
  // pathname-correct check; this layout-level call only fires in the rare
  // expired-session race, and "/dashboard" is the app's home, so losing the
  // exact destination in that rare case is an acceptable, honestly-documented
  // trade-off rather than a bug to silently paper over.
  const user = await requireUser("/dashboard");
  const canHost = user.role === "host" || user.role === "admin";

  const navItems = [
    { href: "/sessions", label: "Sessions" },
    { href: "/history", label: "History" },
    { href: "/leaderboard", label: "Leaderboard" },
    ...(canHost ? [{ href: "/sessions/new", label: "New session" }] : []),
    { href: "/profile", label: "Profile" },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <SkipLink />
      <header className="bg-navy px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 whitespace-nowrap rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-white"
            >
              <Image
                src="/brand/jakbar-twogether.jpeg"
                alt=""
                width={36}
                height={36}
                className="size-9 rounded-full border-2 border-white object-cover"
              />
              <span className="font-display text-xl font-extrabold uppercase italic tracking-tight">
                Jakbar Twogether
              </span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
              <span className="hidden truncate text-white/85 sm:inline">
                {user.fullName ?? user.email}
              </span>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-white outline-none transition-colors duration-[var(--dur-micro)] hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-white max-md:min-h-11"
              >
                <House className="size-4" aria-hidden="true" />
                <span className="max-sm:sr-only">Main site</span>
              </Link>
              <SignOutButton />
            </div>
          </div>
          <NavLinks
            items={navItems}
            className="flex flex-wrap items-center gap-1 py-1 text-sm"
            linkClassName="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-white outline-none transition-colors duration-[var(--dur-micro)] hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-white max-md:min-h-11"
            activeClassName="bg-cork text-navy hover:bg-cork"
          />
        </div>
      </header>
      <main id="main" className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
