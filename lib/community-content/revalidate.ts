import type { RevalidationPath } from "@/lib/gallery/revalidate";

// Pattern form with type "page" (per the Next docs for revalidatePath): the
// [locale] pattern invalidates every locale in one call, where a literal path
// would only hit the non-prefixed (default locale) URL.
export function communityContentRevalidationPaths(): RevalidationPath[] {
  return [
    { path: "/[locale]/(marketing)/about", type: "page" },
    { path: "/[locale]/(marketing)/faq", type: "page" },
  ];
}
