import type { SessionInput } from "@/lib/validation/session";
import type { Database } from "@/types/supabase";

export type SessionKind = Database["public"]["Enums"]["session_kind"];

// Pure object construction, deliberately kept in its own module (rather than
// inline in updateSession, or in sessions.ts itself) with no "use server"
// pragma and no Supabase/next imports, so it can be unit-tested directly
// (tests/unit/session-payload.test.ts) without pulling in the "server-only" import
// chain that lib/actions/sessions.ts -> lib/dal/sessions.ts carries -- that
// chain throws when imported outside a real Next server context, which is
// exactly what a plain Vitest/node run is.
//
// courtCount is deliberately never part of this payload even though it's on
// SessionInput: courts are reconciled through the manage page's add/delete
// controls (guard_court_delete trigger), and writing court_count here
// without touching the courts table would desync the two. Do not "align"
// this with createSession's insert payload by adding court_count back in.
//
// Drilling sessions add three more columns that are never written here:
// kind is fixed at creation, and coach_count / seats_per_coach (with the
// max_participants and court_count they derive) change only through the
// capacity-adjust RPC, which promotes the waitlist and reconciles courts under
// the session lock. For drilling, max_participants is therefore omitted too; a
// plain UPDATE of it would break the coach_count * seats_per_coach CHECK.
// Open play keeps writing max_participants as before.
export function sessionUpdatePayload(values: SessionInput, kind: SessionKind) {
  return {
    title: values.title,
    description: values.description,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    location: values.location,
    location_url: values.locationUrl,
    price: values.price,
    premium_surcharge_idr: values.premiumSurchargeIdr,
    ...(kind === "drilling" ? {} : { max_participants: values.maxParticipants }),
    waitlist_capacity: values.waitlistCapacity,
    registration_state: values.registrationState,
    status: values.status,
  };
}
