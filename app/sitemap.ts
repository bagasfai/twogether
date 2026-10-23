import type { MetadataRoute } from "next";
import { listSitemapAlbums, listSitemapSessions } from "@/lib/dal/sitemap";
import { buildSitemap } from "@/lib/seo/sitemap";
import { getSiteUrl } from "@/lib/seo/urls";

// Cached for an hour: new sessions and albums reach crawlers within the hour,
// and the sitemap is not worth a database round trip per crawler request.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  // Nothing to build without an absolute origin; skip the queries.
  if (!siteUrl) return [];

  // TEMP: diagnose "Invalid API key" on Vercel build. Remove after.
  console.log(
    "sitemap env",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
  );

  const [sessions, albums] = await Promise.all([
    listSitemapSessions(),
    listSitemapAlbums(),
  ]);
  return buildSitemap(siteUrl, sessions, albums);
}
