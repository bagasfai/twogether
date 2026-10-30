export const DEFAULT_REDIRECT = "/dashboard";

// `next` arrives from the query string, so it is attacker-controlled. Only a
// single-slash absolute path is allowed: "//host" and "/\host" both leave the
// site, and some browsers normalise the backslash form into the protocol-
// relative one.
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_REDIRECT;
  // The WHATWG URL parser strips raw tab, LF and CR out of a relative
  // reference before parsing it, so "/\t/evil.example.com" (and the LF/CR
  // equivalents) resolve to "//evil.example.com" -- protocol-relative --
  // even though the raw string here still starts with a single slash and
  // would sail past the checks below. Reject any C0 control character before
  // those checks run. A percent-encoded control character (e.g. "/%09/...")
  // is unaffected -- it stays encoded and is not a redirect risk.
  if (/[\x00-\x1f]/.test(value)) return DEFAULT_REDIRECT;
  if (!value.startsWith("/")) return DEFAULT_REDIRECT;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_REDIRECT;
  return value;
}
