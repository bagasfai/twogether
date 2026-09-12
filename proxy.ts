import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes in the (app) group. /sessions and /sessions/[id] are public, so this
// cannot be a plain /sessions prefix.
function isProtected(pathname: string): boolean {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  if (pathname === "/sessions/new") return true;
  if (/^\/sessions\/[^/]+\/manage$/.test(pathname)) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  // Optimistic UX only. Proxy runs on every request including prefetches, so it
  // reads the already-refreshed session and makes no extra query. Every (app)
  // page re-checks through the DAL, and RLS is the actual enforcement --
  // deleting this block must not make any data reachable that was not reachable before.
  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;

    const redirectResponse = NextResponse.redirect(url);
    // carry the refreshed auth cookies onto the redirect, or the next request
    // starts from a stale session
    for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image files (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
