import type { RevalidationPath } from "@/lib/gallery/revalidate";

// Socials and featured posts render on the landing page and the partner page.
// The [locale] pattern invalidates every locale in one call (see
// lib/gallery/revalidate.ts).
export function socialRevalidationPaths(): RevalidationPath[] {
  return [
    { path: "/[locale]/(marketing)", type: "page" },
    { path: "/[locale]/(marketing)/partner", type: "page" },
  ];
}
