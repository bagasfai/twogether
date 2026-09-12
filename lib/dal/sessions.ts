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

export async function listMyHostedSessions(): Promise<HostedSession[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(`${COLUMNS}, session_hosts!inner(user_id)`)
    .eq("session_hosts.user_id", user.id)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => toHostedSession(row as unknown as Row));
}

// Returns null when the caller is not a host of this session: sessions_select
// hides drafts from non-hosts, and session_hosts is checked explicitly for the
// rest. RLS is the enforcement; this shapes it into a 404.
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
