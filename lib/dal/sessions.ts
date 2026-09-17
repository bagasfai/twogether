import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Database } from "@/types/supabase";

export type SessionStatus = Database["public"]["Enums"]["session_status"];

export type HostedSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  maxParticipants: number;
  waitlistCapacity: number;
  courtCount: number;
  status: SessionStatus;
  registrationState: "closed" | "open";
};

const COLUMNS =
  "id, title, starts_at, ends_at, location, max_participants, waitlist_capacity, court_count, status, registration_state";

type Row = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  max_participants: number;
  waitlist_capacity: number;
  court_count: number;
  status: SessionStatus;
  registration_state: "closed" | "open";
};

function toHostedSession(row: Row): HostedSession {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    maxParticipants: row.max_participants,
    waitlistCapacity: row.waitlist_capacity,
    courtCount: row.court_count,
    status: row.status,
    registrationState: row.registration_state,
  };
}

// Excludes completed/cancelled -- this powers "sessions you host" on the
// dashboard and the /sessions preview, both meant to surface what a host
// still needs to act on, soonest first, not a full history.
export async function listMyHostedSessions(): Promise<HostedSession[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(`${COLUMNS}, session_hosts!inner(user_id)`)
    .eq("session_hosts.user_id", user.id)
    .in("status", ["draft", "scheduled", "live"])
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => toHostedSession(row as unknown as Row));
}

// Returns null when the caller is not a host of this session. For a DRAFT
// session that is RLS: sessions_select_public_or_host hides drafts from
// non-hosts outright. For scheduled/live/completed sessions it is NOT RLS --
// sessions_select_public_or_host returns those rows to everyone, and
// session_hosts_select_authenticated is `using (true)`, so the `!inner` join
// against session_hosts matches for every host of every session, not just
// this caller. The `.eq("session_hosts.user_id", user.id)` below is the only
// thing scoping the result to the caller in that case -- it is
// application-level, not RLS, and it is load-bearing. Do not remove it as a
// "simplification": doing so would let any host read any other host's roster
// for a non-draft session.
export async function getHostSession(id: string): Promise<HostedSession | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(`${COLUMNS}, session_hosts!inner(user_id)`)
    .eq("id", id)
    .eq("session_hosts.user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data ? toHostedSession(data as unknown as Row) : null;
}
