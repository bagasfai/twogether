import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import type { Database } from "@/types/supabase";

export type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

export type MyRegistration = {
  id: string;
  status: ParticipantStatus;
  registeredAt: string;
  /** 1-based queue position, null unless status is waiting_list */
  waitlistPosition: number | null;
  /** true when a host added this registration and the member hasn't acknowledged it yet */
  needsConfirmation: boolean;
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
  consentedAt: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export type AddableMember = {
  id: string;
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
    .select("id, status, registered_at, added_by, consented_at")
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
    needsConfirmation: data.added_by !== null && data.consented_at === null,
  };
}

export async function listMyUpcomingRegistrations(): Promise<MyRegistrationRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .select(
      "id, session_id, status, registered_at, added_by, consented_at, sessions!inner(title, starts_at, location)",
    )
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
      needsConfirmation: row.added_by !== null && row.consented_at === null,
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
      "id, user_id, status, registered_at, checked_in_at, added_by, consented_at, profiles!participants_user_id_fkey(full_name, avatar_url)",
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
    consentedAt: row.consented_at,
    fullName: row.profiles.full_name,
    avatarUrl: row.profiles.avatar_url,
  }));
}

// Host-only: candidates for host_add_participant. Scoped to sessions the
// caller actually hosts (checked via getHostSession, same as the /manage
// page itself) rather than relying on profiles' own `using (true)` SELECT
// policy alone -- that policy is correct for the app at large (full_name and
// avatar_url are non-sensitive), but this function's whole purpose is
// picking someone to register, so it should not double as a general member
// directory for a session a caller doesn't host.
export async function searchAddableMembers(sessionId: string, query: string): Promise<AddableMember[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const session = await getHostSession(sessionId);
  if (!session) return [];

  const supabase = await createClient();

  // Exclude anyone already an active (non-cancelled) participant -- adding
  // them again is what host_add_participant's own upsert is for, not a fresh
  // pick from search.
  const { data: active } = await supabase
    .from("participants")
    .select("user_id")
    .eq("session_id", sessionId)
    .neq("status", "cancelled");

  const excluded = (active ?? []).map((row) => row.user_id);

  let builder = supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .ilike("full_name", `%${query}%`)
    .order("full_name", { ascending: true })
    .limit(8);

  if (excluded.length > 0) {
    builder = builder.not("id", "in", `(${excluded.join(",")})`);
  }

  const { data, error } = await builder;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  }));
}
