import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/dal/user";
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <Link href="/dashboard" className="font-semibold">Jakbar Twogether</Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/sessions">Sessions</Link>
          {canHost ? <Link href="/sessions/new">New session</Link> : null}
          <Link href="/profile">Profile</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user.fullName ?? user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
