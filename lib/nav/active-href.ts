const HOSTED_HREF = "/hosted";
const HOST_ONLY_PATH = /^\/sessions\/(new|[^/]+\/manage)(\/|$)/;

/** Longest href that equals the pathname or is a path-prefix of it, else null.
 * Host-only session pages count as Hosted when the nav has a Hosted entry. */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  if (hrefs.includes(HOSTED_HREF) && HOST_ONLY_PATH.test(pathname)) return HOSTED_HREF;
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      if (best === null || href.length > best.length) best = href;
    }
  }
  return best;
}
