import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Role } from "@/lib/dal/user";

export type MyProfile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  role: Role;
};

export async function getMyProfile(): Promise<MyProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // phone lives in profiles_private, readable only by self, an admin, or a host
  // of a session this user is a non-cancelled participant in.
  const { data } = await supabase
    .from("profiles_private")
    .select("phone")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    phone: data?.phone ?? null,
    role: user.role,
  };
}
