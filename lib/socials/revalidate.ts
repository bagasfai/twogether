import type { RevalidationPath } from "@/lib/gallery/revalidate";

// Socials and featured posts render on the landing page, the partner page and
// the footer in the marketing layout, so the layout is revalidated (it covers
// every page beneath it). The [locale] pattern invalidates every locale in one
// call (see lib/gallery/revalidate.ts).
export function socialRevalidationPaths(): RevalidationPath[] {
  return [{ path: "/[locale]/(marketing)", type: "layout" }];
}
