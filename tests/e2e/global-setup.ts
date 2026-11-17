import { sweepE2eData } from "./support/admin";
import { assertLocalStack, env } from "./support/env";

export default async function globalSetup(): Promise<void> {
  assertLocalStack();

  const down = new Error(`Local Supabase is not running on ${env.supabaseUrl}; run "npx supabase start"`);
  let response: Response;
  try {
    response = await fetch(`${env.supabaseUrl}/auth/v1/health`, { headers: { apikey: env.anonKey } });
  } catch {
    throw down;
  }
  if (!response.ok) throw down;

  await sweepE2eData();

  // Auth gives the send-email hook 5 s; a cold edge worker can take longer and
  // would fail the first signup. Boot it here. The response does not matter.
  await fetch(`${env.supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
}
