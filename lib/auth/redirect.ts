export const DEFAULT_REDIRECT = "/dashboard";

// `next` arrives from the query string, so it is attacker-controlled. Only a
// single-slash absolute path is allowed: "//host" and "/\host" both leave the
// site, and some browsers normalise the backslash form into the protocol-
// relative one.
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_REDIRECT;
  if (!value.startsWith("/")) return DEFAULT_REDIRECT;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_REDIRECT;
  return value;
}
