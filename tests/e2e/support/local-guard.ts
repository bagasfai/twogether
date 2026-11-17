const LOCAL_HOSTS = ["127.0.0.1", "localhost"];

export function localStackProblem(url: string, expectedPort: string | null): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `NEXT_PUBLIC_SUPABASE_URL is not a URL: ${url}`;
  }
  if (!LOCAL_HOSTS.includes(parsed.hostname)) {
    return `Refusing to run e2e tests against ${parsed.hostname}. The suite creates and deletes users with the service-role key and only runs against the local Supabase stack (127.0.0.1 or localhost).`;
  }
  if (!expectedPort) {
    return "Could not read this project's API port from supabase/config.toml, so the local stack cannot be told apart from another project's.";
  }
  if (parsed.port !== expectedPort) {
    return `Refusing to run e2e tests against port ${parsed.port || "(default)"}: this project's local Supabase API is on ${expectedPort} (supabase/config.toml). Another project's stack may be listening there.`;
  }
  return null;
}

export function appServerProblem(status: number, html: string, canaryTitle: string): string | null {
  if (status === 200 && html.includes(canaryTitle)) return null;
  return `The app server does not show a session that was just created in the local stack (HTTP ${status}). It is using a different Supabase project than this test run, most likely an already-running dev server with other environment values. Stop it and let Playwright start its own.`;
}
