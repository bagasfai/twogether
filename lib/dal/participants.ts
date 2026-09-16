import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Database } from "@/types/supabase";

export type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

export type MyRegistration = {
  id: string;
  status: ParticipantStatus;
  registeredAt: string;
  /** 1-based queue position, null unless status is waiting_list */
  waitlistPosition: number | null;
};

export type MyRegistrationRow = MyRegistration & {
  sessionId: string;
  title: string;
  startsAt: string;
  location: string;
};

export type RosterEntry = {
  id: string;
  userId: string;
  status: ParticipantStatus;
  registeredAt: string;
  checkedInAt: string | null;
  addedBy: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export type PublicRosterEntry = {
  status: ParticipantStatus;
  registeredAt: string;
  fullName: string | null;
};

// waitlist_position_of() exists in the database but EXECUTE is revoked from
// authenticated, so count ahead-of-me rows instead. The participants SELECT
// policy makes non-cancelled rows of a public session readable, so this counts
// correctly under RLS.
async function waitlistPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  registeredAt: string,
): Promise<number> {
  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "waiting_list")
    .lt("registered_at", registeredAt);

  return (count ?? 0) + 1;
}

export async function getMyRegistration(sessionId: string): Promise<MyRegistration | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("participants")
    .select("id, status, registered_at")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || data.status === "cancelled") return null;

  return {
    id: data.id,
    status: data.status,
    registeredAt: data.registered_at,
    waitlistPosition:
      data.status === "waiting_list"
        ? await waitlistPosition(supabase, sessionId, data.registered_at)
        : null,
  };
}

export async function listMyUpcomingRegistrations(): Promise<MyRegistrationRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .select("id, session_id, status, registered_at, sessions!inner(title, starts_at, location)")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .gte("sessions.starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true, referencedTable: "sessions" });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      sessionId: row.session_id,
      status: row.status,
      registeredAt: row.registered_at,
      title: row.sessions.title,
      startsAt: row.sessions.starts_at,
      location: row.sessions.location,
      waitlistPosition:
        row.status === "waiting_list"
          ? await waitlistPosition(supabase, row.session_id, row.registered_at)
          : null,
    })),
  );
}

export async function listRoster(sessionId: string): Promise<RosterEntry[]> {
  // Every lib/dal/* function performs its own auth check at the data source
  // (see the design spec, §7). Not currently exploitable on its own -- the
  // participants SELECT policy bounds this to a public/host-visible session,
  // and the /manage page gates with requireHost -- but this function was the
  // one place that silently skipped the invariant.
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("participants")
    .select(
      "id, user_id, status, registered_at, checked_in_at, added_by, profiles!participants_user_id_fkey(full_name, avatar_url)",
    )
    .eq("session_id", sessionId)
    .order("registered_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    registeredAt: row.registered_at,
    checkedInAt: row.checked_in_at,
    addedBy: row.added_by,
    fullName: row.profiles.full_name,
    avatarUrl: row.profiles.avatar_url,
  }));
}

// Member-facing view of a session's roster: names only, no ids or check-in
// state a regular participant has no business seeing. RLS still does the
// real work (participants_select_self_host_or_public), this just narrows
// the columns for a non-host caller.
export async function listPublicRoster(sessionId: string): Promise<PublicRosterEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("participants")
    .select("status, registered_at, profiles!participants_user_id_fkey(full_name)")
    .eq("session_id", sessionId)
    .neq("status", "cancelled")
    .order("registered_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    status: row.status,
    registeredAt: row.registered_at,
    fullName: row.profiles.full_name,
  }));
}
