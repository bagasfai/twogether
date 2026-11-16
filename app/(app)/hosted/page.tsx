import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/app/page-title";
import { HostedSessionsList } from "@/components/sessions/hosted-sessions-list";
import { Button } from "@/components/ui/button";
import { requireHost } from "@/lib/dal/user";
import { listMyHostedSessions } from "@/lib/dal/sessions";

export const metadata: Metadata = { title: "Hosted sessions" };

export default async function HostedPage() {
  await requireHost("/hosted");
  const hosted = await listMyHostedSessions();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle description="Sessions you run. Open one to manage registration, check-in and courts.">
          Hosted sessions
        </PageTitle>
        <Button asChild className="max-md:min-h-11">
          <Link href="/sessions/new">New session</Link>
        </Button>
      </div>
      {hosted.length === 0 ? (
        <p className="text-sm text-muted-foreground">You are not hosting any upcoming sessions.</p>
      ) : (
        <HostedSessionsList sessions={hosted} />
      )}
    </div>
  );
}
