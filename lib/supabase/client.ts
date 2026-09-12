import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

// Browser client. Client islands only, and only where a server round trip
// genuinely cannot do the job. Ordinary CRUD belongs in a Server Action.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
