import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type Role = Database["public"]["Enums"]["user_role"];

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role;
};

// React cache dedupes this within a single request, so a layout and the page
// inside it share one auth round trip.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  // getUser(), never getSession(): getSession() trusts the cookie contents
  // without verifying them against the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    id: profile.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
  };
});

export async function requireUser(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

// UX only. RLS is what actually stops a member reaching host data -- deleting
// this check must not make any data reachable that was not reachable before.
export async function requireHost(nextPath: string): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (user.role === "member") redirect("/dashboard");
  return user;
}

// Same caveat as requireHost: UX only. profiles_update_self_or_admin and
// guard_profile_role_change are what actually stop a non-admin from writing
// another profile's role.
export async function requireAdmin(nextPath: string): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
