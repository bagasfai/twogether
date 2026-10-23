import type { MetadataRoute } from "next";
import type { SitemapAlbum, SitemapSession } from "@/lib/dal/sitemap";
import { localizedUrls } from "@/lib/seo/urls";

const STATIC_PATHS = ["/", "/sessions", "/gallery", "/about", "/faq"];

// Pure so it unit-tests without a database. An absolute site URL is required:
// relative URLs are invalid in a sitemap, so null yields an empty list.
export function buildSitemap(
  siteUrl: string | null,
  sessions: SitemapSession[],
  albums: SitemapAlbum[],
): MetadataRoute.Sitemap {
  if (!siteUrl) return [];

  const entry = (path: string, lastModified?: string | null) => {
    const { url, languages } = localizedUrls(path, siteUrl);
    return {
      url,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages },
    };
  };

  return [
    ...STATIC_PATHS.map((path) => entry(path)),
    ...sessions.map((s) => entry(`/sessions/${s.id}`, s.updatedAt)),
    ...albums.map((a) => entry(`/gallery/${a.id}`, a.lastModified)),
  ];
}
