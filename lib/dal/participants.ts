import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import { excludedUserIds } from "@/lib/sessions/excluded-user-ids";
import type { Database } from "@/types/supabase";

export type ParticipantStatus =
  Database["public"]["Enums"]["participant_status"];

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

// A guest a member brought along has no account, so there's no row of its
// own to compare against MyRegistration -- it's keyed by participant id
// rather than being "the" registration, since one member can bring several.
export type MyGuestRegistration = {
  id: string;
  guestName: string;
  status: ParticipantStatus;
  registeredAt: string;
  waitlistPosition: number | null;
};

export type RosterEntry = {
  id: string;
  userId: string | null;
  status: ParticipantStatus;
  registeredAt: string;
  checkedInAt: string | null;
  paidAt: string | null;
  noShowAt: string | null;
  addedBy: string | null;
  consentedAt: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /** true when this row is a guest brought by a member, not their own account */
  isGuest: boolean;
  guestPhone: string | null;
  isPremium: boolean;
  /** set when a premium registration moved this participant to the waitlist */
  bumpedAt: string | null;
  /** set when this seat was handed to another member; the row is then inert */
  replacedBy: string | null;
  /** the member who pays when it is not the seat holder (seat hand-off) */
  paidByUserId: string | null;
  /** display name of paidByUserId, resolved from profiles */
  paidByName: string | null;
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

export async function getMyRegistration(
  sessionId: string,
): Promise<MyRegistration | null> {
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

export async function listMyGuestRegistrations(
  sessionId: string,
): Promise<MyGuestRegistration[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .select("id, guest_name, status, registered_at")
    .eq("session_id", sessionId)
    .eq("registered_by", user.id)
    .not("guest_name", "is", null)
    .neq("status", "cancelled")
    .order("registered_at", { ascending: true });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      // not-null by the participants_member_xor_guest check + the query
      // filter above, but the generated column type is still `string | null`
      guestName: row.guest_name as string,
      status: row.status,
      registeredAt: row.registered_at,
      waitlistPosition:
        row.status === "waiting_list"
          ? await waitlistPosition(supabase, sessionId, row.registered_at)
          : null,
    })),
  );
}

export type MyPastRegistrationRow = {
  id: string;
  sessionId: string;
  status: ParticipantStatus;
  registeredAt: string;
  title: string;
  startsAt: string;
  location: string;
};

export type MyPastGuestRegistrationRow = {
  id: string;
  sessionId: string;
  guestName: string;
  status: ParticipantStatus;
  registeredAt: string;
  title: string;
  startsAt: string;
  location: string;
};

export async function listMyUpcomingRegistrations(): Promise<
  MyRegistrationRow[]
> {
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

// Past-session counterpart to listMyUpcomingRegistrations(). Cancelled rows
// are excluded, same as the upcoming query -- cancelling means you opted out
// before the event happened, not something that occurred at the session.
// waiting_list rows that never got promoted ARE included: that's still real
// history of an attempt. waitlistPosition/needsConfirmation are dropped from
// the row shape entirely (not hardcoded null) since both concepts -- queue
// position, pending confirmation -- are meaningless once the event is over.
export async function listMyPastRegistrations(): Promise<
  MyPastRegistrationRow[]
> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .select(
      "id, session_id, status, registered_at, sessions!inner(title, starts_at, location)",
    )
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .lt("sessions.starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false, referencedTable: "sessions" });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    status: row.status,
    registeredAt: row.registered_at,
    title: row.sessions.title,
    startsAt: row.sessions.starts_at,
    location: row.sessions.location,
  }));
}

// Past-session counterpart to listMyGuestRegistrations(), but across all of
// the caller's sessions rather than one -- guests you brought are part of
// your own activity record, same reasoning as including your own waitlisted
// rows above.
export async function listMyPastGuestRegistrations(): Promise<
  MyPastGuestRegistrationRow[]
> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .select(
      "id, session_id, guest_name, status, registered_at, sessions!inner(title, starts_at, location)",
    )
    .eq("registered_by", user.id)
    .not("guest_name", "is", null)
    .neq("status", "cancelled")
    .lt("sessions.starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false, referencedTable: "sessions" });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    // not-null by the participants_member_xor_guest check + the query
    // filter above, but the generated column type is still `string | null`
    guestName: row.guest_name as string,
    status: row.status,
    registeredAt: row.registered_at,
    title: row.sessions.title,
    startsAt: row.sessions.starts_at,
    location: row.sessions.location,
  }));
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
      "id, user_id, status, registered_at, checked_in_at, paid_at, no_show_at, added_by, consented_at, guest_name, guest_phone, is_premium, bumped_at, replaced_by, paid_by_user_id, profiles!participants_user_id_fkey(full_name, avatar_url)",
    )
    .eq("session_id", sessionId)
    .order("registered_at", { ascending: true });

  if (error) throw error;

  // paid_by_user_id has no FK to profiles worth embedding, so resolve the payer
  // names in one extra query, and only when some seat was handed over.
  const payerIds = [...new Set((data ?? []).flatMap((row) => (row.paid_by_user_id ? [row.paid_by_user_id] : [])))];
  const payerNames = new Map<string, string | null>();
  if (payerIds.length > 0) {
    const { data: payers, error: payerError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", payerIds);
    if (payerError) throw payerError;
    for (const payer of payers ?? []) payerNames.set(payer.id, payer.full_name);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    registeredAt: row.registered_at,
    checkedInAt: row.checked_in_at,
    paidAt: row.paid_at,
    noShowAt: row.no_show_at,
    addedBy: row.added_by,
    consentedAt: row.consented_at,
    fullName: row.profiles?.full_name ?? row.guest_name,
    avatarUrl: row.profiles?.avatar_url ?? null,
    isGuest: row.guest_name !== null,
    guestPhone: row.guest_phone,
    isPremium: row.is_premium,
    bumpedAt: row.bumped_at,
    replacedBy: row.replaced_by,
    paidByUserId: row.paid_by_user_id,
    paidByName: row.paid_by_user_id ? (payerNames.get(row.paid_by_user_id) ?? null) : null,
  }));
}

export async function listPublicRoster(
  sessionId: string,
): Promise<PublicRosterEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("participants")
    .select(
      "status, registered_at, guest_name, profiles!participants_user_id_fkey(full_name)",
    )
    .eq("session_id", sessionId)
    .neq("status", "cancelled")
    .order("registered_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    status: row.status,
    registeredAt: row.registered_at,
    fullName: row.profiles?.full_name ?? row.guest_name,
  }));
}

// Candidates for host_add_participant and for the Replace seat picker. A host
// of the session may search anyone; a non-host may search only when they hold
// a confirmed seat in it (to hand that seat over). Everyone else gets [] so
// this does not double as a general member directory -- profiles' own
// `using (true)` SELECT policy is right for the app at large (full_name and
// avatar_url are non-sensitive), but this function's purpose is picking
// someone to register.
export async function searchAddableMembers(
  sessionId: string,
  query: string,
): Promise<AddableMember[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  // A host may pick anyone; a member may pick only to hand off their own
  // confirmed seat (the Replace me flow). transfer_participation re-checks
  // ownership, so this gate only keeps the picker from being a general
  // directory for sessions the caller has no seat in.
  const session = await getHostSession(sessionId);
  if (!session) {
    const { data: ownSeat } = await supabase
      .from("participants")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "confirmed")
      .maybeSingle();
    if (!ownSeat) return [];
  }

  // Exclude anyone already an active (non-cancelled) participant -- adding
  // them again is what host_add_participant's own upsert is for, not a fresh
  // pick from search.
  const { data: active } = await supabase
    .from("participants")
    .select("user_id")
    .eq("session_id", sessionId)
    .neq("status", "cancelled");

  // guest rows have user_id NULL; a null in the not-in list breaks the filter
  const excluded = excludedUserIds(active ?? []);

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
