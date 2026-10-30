import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import type { Database } from "@/types/supabase";

export type CourtStatus = Database["public"]["Enums"]["court_status"];

export type CourtEntry = {
  id: string;
  courtNumber: number;
  status: CourtStatus;
};

export async function listCourts(sessionId: string): Promise<CourtEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courts")
    .select("id, court_number, status")
    .eq("session_id", sessionId)
    .order("court_number", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    courtNumber: row.court_number,
    status: row.status,
  }));
}
