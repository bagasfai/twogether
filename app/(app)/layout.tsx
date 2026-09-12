import Link from "next/link";
import { requireUser } from "@/lib/dal/user";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The proxy already redirected an anonymous visitor; this is the real check.
  // It also covers a session that expired between the proxy and the render.
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
