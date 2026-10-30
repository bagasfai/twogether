import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal/user";
import { listMyHostedSessions } from "@/lib/dal/sessions";

// /sessions is ISR-cached (see app/(marketing)/sessions/page.tsx); fetched
// client-side after hydration for the same reason as
// /api/sessions/[id]/participants -- this must not become a cookie read on
// the cached page itself.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { sessions: null },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const hosted = await listMyHostedSessions();

  return NextResponse.json({ sessions: hosted }, { headers: { "Cache-Control": "private, no-store" } });
}
