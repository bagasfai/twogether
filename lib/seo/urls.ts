import { routing } from "@/i18n/routing";

// Origin of the deployed site, or null when NEXT_PUBLIC_SITE_URL is unset,
// malformed or not http(s). Sitemaps need absolute URLs, so callers treat null
// as "emit nothing" rather than guessing a host.
export function getSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function localeUrl(path: string, siteUrl: string, locale: string): string {
  // as-needed: the default locale is unprefixed, every other locale is /<locale>.
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const rest = path === "/" ? "" : path;
  return `${siteUrl}${prefix}${rest}`;
}

// `path` starts with "/" ("/" for the root). `url` is the default-locale URL.
export function localizedUrls(
  path: string,
  siteUrl: string,
): { url: string; languages: { id: string; en: string } } {
  return {
    url: localeUrl(path, siteUrl, routing.defaultLocale),
    languages: {
      id: localeUrl(path, siteUrl, "id"),
      en: localeUrl(path, siteUrl, "en"),
    },
  };
}
