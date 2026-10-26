import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { getHostSession } from "@/lib/dal/sessions";
import { resolvePlayerAttributes, type PlayerAttributes } from "@/lib/players/resolve";

// Host/admin only. Level and guest gender are never exposed to members: RLS
// on member_levels / guest_attributes denies them, and profiles_private is
// readable by a host only under the consent gate. Denied or failed reads
// yield an empty map rather than throwing, and a non-host caller short-circuits
// before any attribute table is queried.
//
// Keyed by participant id. Three batched queries (roster, then one `in`
// lookup per source) instead of per-row lookups.
export async function getRosterAttributes(
  sessionId: string,
): Promise<Map<string, PlayerAttributes>> {
  const result = new Map<string, PlayerAttributes>();

  const user = await getCurrentUser();
  if (!user) return result;

  const session = await getHostSession(sessionId);
  if (!session) return result;

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("participants")
    .select("id, user_id, guest_name")
    .eq("session_id", sessionId);
  if (error || !rows) return result;

  const memberIds = rows.flatMap((r) => (r.user_id !== null ? [r.user_id] : []));
  const guestIds = rows.filter((r) => r.user_id === null).map((r) => r.id);

  const [genders, levels, guests] = await Promise.all([
    memberIds.length > 0
      ? supabase.from("profiles_private").select("user_id, gender").in("user_id", memberIds)
      : null,
    memberIds.length > 0
      ? supabase.from("member_levels").select("user_id, level").in("user_id", memberIds)
      : null,
    guestIds.length > 0
      ? supabase
          .from("guest_attributes")
          .select("participant_id, gender, level")
          .in("participant_id", guestIds)
      : null,
  ]);

  const genderByUser = new Map(
    (genders?.data ?? []).map((g) => [g.user_id, g.gender] as const),
  );
  const levelByUser = new Map(
    (levels?.data ?? []).map((l) => [l.user_id, l.level] as const),
  );
  const guestById = new Map(
    (guests?.data ?? []).map((g) => [g.participant_id, g] as const),
  );

  for (const row of rows) {
    if (row.user_id !== null) {
      result.set(
        row.id,
        resolvePlayerAttributes({
          gender: genderByUser.get(row.user_id) ?? null,
          level: levelByUser.get(row.user_id) ?? null,
        }),
      );
    } else {
      const g = guestById.get(row.id);
      result.set(
        row.id,
        resolvePlayerAttributes({ gender: g?.gender ?? null, level: g?.level ?? null }),
      );
    }
  }

  return result;
}
