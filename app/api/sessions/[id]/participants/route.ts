import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal/user";
import { listPublicRoster } from "@/lib/dal/participants";

// Same reasoning as my-registration/route.ts: the session detail page is
// ISR-cached, so this is fetched client-side after hydration instead of
// baked into the cached render.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sessions/[id]/participants">) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { participants: null },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const participants = await listPublicRoster(id);

  return NextResponse.json({ participants }, { headers: { "Cache-Control": "private, no-store" } });
}
