"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { createCourtSchema, deleteCourtSchema, setCourtStatusSchema } from "@/lib/validation/courts";
import type { Database } from "@/types/supabase";

type CourtStatus = Database["public"]["Enums"]["court_status"];

// Not an RPC: unlike registration/waitlist, court count isn't a scarce
// resource under contention in the same way -- the unique (session_id,
// court_number) constraint is the actual race guard, and a loser here just
// retries with the next number.
export async function createCourt(sessionId: string): Promise<ActionResult<{ id: string }>> {
  const parsed = createCourtSchema.safeParse({ sessionId });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("court_count")
    .eq("id", parsed.data.sessionId)
    .single();

  if (sessionError) return fail("not_found");

  const { data: existing, error: courtsError } = await supabase
    .from("courts")
    .select("court_number")
    .eq("session_id", parsed.data.sessionId);

  if (courtsError) return fail("unknown", "Could not load existing courts.");

  if (existing.length >= session.court_count) {
    return fail("validation", "All courts for this session have already been created.");
  }

  const nextCourtNumber = existing.reduce((max, row) => Math.max(max, row.court_number), 0) + 1;

  const { data, error } = await supabase
    .from("courts")
    .insert({ session_id: parsed.data.sessionId, court_number: nextCourtNumber })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    // 23505: someone else just took this court_number. Ask the host to retry
    // rather than surfacing raw Postgres text.
    if (error.code === "23505") return fail("unknown", "That court number was just taken. Try again.");
    return fail("unknown", "Could not create the court.");
  }

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok({ id: data.id });
}

export async function setCourtStatus(
  courtId: string,
  sessionId: string,
  status: CourtStatus,
): Promise<ActionResult<null>> {
  const parsed = setCourtStatusSchema.safeParse({ courtId, sessionId, status });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("courts")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.courtId)
    .eq("session_id", parsed.data.sessionId);

  if (error) return fail("unknown", "Could not update the court.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}

export async function deleteCourt(courtId: string, sessionId: string): Promise<ActionResult<null>> {
  const parsed = deleteCourtSchema.safeParse({ courtId, sessionId });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("courts")
    .delete()
    .eq("id", parsed.data.courtId)
    .eq("session_id", parsed.data.sessionId);

  if (error) return fail("unknown", "Could not delete the court.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}
