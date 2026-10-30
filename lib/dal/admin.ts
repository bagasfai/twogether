import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Role } from "@/lib/dal/user";

export type MemberRow = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
};

// Admin-only in practice (profiles_select_authenticated is `using (true)`,
// so RLS alone doesn't gate this list) -- the /admin page is the actual
// gate, via requireAdmin. Every lib/dal/* function still checks auth itself
// per the design spec's §7 invariant, so a caller with no session gets an
// empty list rather than an RLS-permitted-but-meaningless read.
export async function listAllMembers(): Promise<MemberRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
  }));
}
