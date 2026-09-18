import type { SessionInput } from "@/lib/validation/session";

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
export function sessionUpdatePayload(values: SessionInput) {
  return {
    title: values.title,
    description: values.description,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    location: values.location,
    location_url: values.locationUrl,
    price: values.price,
    max_participants: values.maxParticipants,
    waitlist_capacity: values.waitlistCapacity,
    registration_state: values.registrationState,
    status: values.status,
  };
}
