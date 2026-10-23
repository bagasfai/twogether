// Crawler-hostile paths: authenticated, admin, auth and API routes. Robots is
// advisory only (authorization stays in RLS and the DAL). A guard test in
// tests/unit/robots.test.ts fails when a new top-level route directory under
// app/(app), app/(auth), app/auth or app/api is not covered here.
export const DISALLOWED_PATHS = [
  "/dashboard",
  "/profile",
  "/admin",
  "/history",
  "/login",
  "/signup",
  "/auth",
  "/api",
  "/sessions/new",
  "/sessions/*/manage",
];
