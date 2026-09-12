import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

export type PublicSession = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  location: string;
  locationUrl: string | null;
  courtCount: number;
  maxParticipants: number;
  waitlistCapacity: number;
  registrationState: "closed" | "open";
};

const COLUMNS =
  "id, title, description, starts_at, ends_at, location, location_url, court_count, max_participants, waitlist_capacity, registration_state";

type Row = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string;
  location_url: string | null;
  court_count: number;
  max_participants: number;
  waitlist_capacity: number;
  registration_state: "closed" | "open";
};

function toPublicSession(row: Row): PublicSession {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    locationUrl: row.location_url,
    courtCount: row.court_count,
    maxParticipants: row.max_participants,
    waitlistCapacity: row.waitlist_capacity,
    registrationState: row.registration_state,
  };
}

export async function listUpcomingPublicSessions(): Promise<PublicSession[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(COLUMNS)
    .eq("status", "scheduled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map(toPublicSession);
}

export async function getPublicSession(id: string): Promise<PublicSession | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase.from("sessions").select(COLUMNS).eq("id", id).maybeSingle();

  // RLS hides a draft session from anon, which surfaces as no row rather than
  // an error -- that is a 404 to a visitor, not a failure.
  if (error) throw error;
  return data ? toPublicSession(data) : null;
}
