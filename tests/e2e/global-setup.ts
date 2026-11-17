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
}
