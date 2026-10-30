import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getMyRegistration, listMyGuestRegistrations } from "@/lib/dal/participants";

// The session detail page is ISR-cached, so the server rendering it cannot know
// who is viewing. The register panel asks here after it hydrates. Routing this
// through a handler rather than querying Supabase from the browser keeps every
// query inside the DAL.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sessions/[id]/my-registration">) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { registration: null, guests: [] },
      // per-user answer: never store it in any shared cache, same as the 200 below
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const [registration, guests] = await Promise.all([
    getMyRegistration(id),
    listMyGuestRegistrations(id),
  ]);

  return NextResponse.json(
    { registration, guests },
    // per-user answer: never store it in any shared cache
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
