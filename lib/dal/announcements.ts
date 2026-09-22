import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentUser } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";

export type AnnouncementRow = {
  id: string;
  sessionId: string | null;
  title: string;
  body: string;
  publishedAt: string;
  createdAt: string;
};

const COLUMNS = "id, session_id, title, body, published_at, created_at";

type Row = {
  id: string;
  session_id: string | null;
  title: string;
  body: string;
  published_at: string | null;
  created_at: string;
};

function toAnnouncementRow(row: Row): AnnouncementRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    body: row.body,
    // Every announcement created through this app is published immediately
    // (createAnnouncement always sets published_at) -- it's only nullable in
    // the schema for a draft state this app never produces. Every query
    // below is already scoped (directly, or via RLS) to rows the caller may
    // read, so this cast is safe rather than defensive.
    publishedAt: row.published_at as string,
    createdAt: row.created_at,
  };
}

// Anon-safe: no auth check, uses the anon-key client so a route calling this
// stays statically cacheable. announcements_select grants anon SELECT
// directly (unlike participants), so no client-fetch/API-route indirection
// is needed here the way RegisteredParticipants needs one.
export async function listPublicCommunityAnnouncements(limit = 5): Promise<AnnouncementRow[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .is("session_id", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// Anon-safe. RLS's published_at is not null + session_is_public(session_id)
// disjunct does the real filtering; this query doesn't need to duplicate
// it, same as getPublicSession not re-checking session visibility itself.
export async function listPublicSessionAnnouncements(sessionId: string): Promise<AnnouncementRow[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .eq("session_id", sessionId)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// Community-wide announcements UNION announcements for sessions the caller
// is currently registered in (non-cancelled, upcoming) -- the same session-id
// set listMyUpcomingRegistrations would return, fetched directly here rather
// than importing that function, since only the session ids are needed.
export async function listMyAnnouncementsFeed(): Promise<AnnouncementRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data: registrations, error: registrationsError } = await supabase
    .from("participants")
    .select("session_id, sessions!inner(starts_at)")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .gte("sessions.starts_at", new Date().toISOString());

  if (registrationsError) throw registrationsError;

  const sessionIds = (registrations ?? []).map((row) => row.session_id);

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .or(
      sessionIds.length > 0
        ? `session_id.is.null,session_id.in.(${sessionIds.join(",")})`
        : "session_id.is.null",
    )
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// getHostSession scopes to sessions this caller hosts (or is admin of, via
// is_session_host's own is_admin() OR) -- same convention as
// searchAddableMembers, returning [] rather than throwing for "not a host
// of this session".
export async function listHostAnnouncements(sessionId: string): Promise<AnnouncementRow[]> {
  const session = await getHostSession(sessionId);
  if (!session) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .eq("session_id", sessionId)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}

// The admin page itself already gates with requireAdmin; this follows the
// DAL convention of every function checking auth at the source rather than
// trusting the caller (see listRoster's comment on the same convention).
export async function listCommunityAnnouncementsForAdmin(): Promise<AnnouncementRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .is("session_id", null)
    .order("published_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAnnouncementRow);
}
