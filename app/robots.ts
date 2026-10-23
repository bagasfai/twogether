import type { MetadataRoute } from "next";
import { DISALLOWED_PATHS } from "@/lib/seo/robots-paths";
import { getSiteUrl } from "@/lib/seo/urls";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS },
    ...(siteUrl ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  };
}
