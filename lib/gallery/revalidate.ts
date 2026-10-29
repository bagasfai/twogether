export type RevalidationPath = { path: string; type?: "page" | "layout" };

// Pattern forms (per the Next docs for revalidatePath): a dynamic segment
// requires type "page", and the [locale] pattern invalidates every locale in
// one call -- literal paths would only hit the non-prefixed (default locale)
// URL. The manage page lives in (app), which has no locale segment, so it is
// a plain literal path.
export function galleryRevalidationPaths(
  albumId: string,
  sessionId: string | null,
): RevalidationPath[] {
  void albumId; // the [id] pattern covers every album; kept for a stable signature
  const paths: RevalidationPath[] = [
    { path: "/[locale]/(marketing)/gallery", type: "page" },
    { path: "/[locale]/(marketing)/gallery/[id]", type: "page" },
  ];
  if (sessionId) {
    paths.push({ path: "/[locale]/(marketing)/sessions/[id]", type: "page" });
    paths.push({ path: `/sessions/${sessionId}/manage` });
  }
  return paths;
}
