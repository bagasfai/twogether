import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Public client: anon key, no cookie adapter, no session persistence. Because it
// never touches cookies(), a route using it stays statically cached -- which is
// the whole point of the (marketing) route group. RLS gives anon read access to
// scheduled/live/completed sessions and their non-cancelled rosters.
//
// Never use this for anything per-user; it has no idea who is calling.
export function createPublicClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
