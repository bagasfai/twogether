import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/dal/user";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Jakbar Twogether
          </Link>
          <nav className="flex flex-1 items-center gap-6 text-sm text-muted-foreground">
            <Link href="/sessions" className="transition-colors hover:text-foreground">
              Sessions
            </Link>
          </nav>
          <Button asChild size="sm" variant={user ? "default" : "outline"}>
            <Link href={user ? "/dashboard" : "/login"}>{user ? "Dashboard" : "Log in"}</Link>
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground">
          <span>Jakbar Twogether</span>
          <span>Badminton, run properly.</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
