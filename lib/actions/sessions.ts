"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { sessionSchema, isZonedInstant, type SessionInput } from "@/lib/validation/session";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

export async function createSession(input: SessionInput): Promise<ActionResult<{ id: string }>> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const values = parsed.data;

  // A value without a zone designator is ambiguous and would be parsed in the
  // server's zone (TZ=UTC on Vercel), not the host's. Refuse it rather than
  // guess -- the client (session-form.tsx) is responsible for sending a
  // zone-qualified instant, converted in the browser where the local zone is
  // actually known.
  const zoneless = (["startsAt", "endsAt"] as const).filter((key) => !isZonedInstant(values[key]));
  if (zoneless.length > 0) {
    return fail(
      "validation",
      "Please pick a start and end time.",
      Object.fromEntries(zoneless.map((key) => [key, ["Missing time zone"]])),
    );
  }

  const supabase = await createClient();

  // sessions_insert_host requires current_user_role() in ('host','admin') AND
  // created_by = auth.uid(). A member reaching this point is refused by RLS,
  // not by any check here. The sessions_add_owner trigger writes the
  // session_hosts owner row.
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      title: values.title,
      description: values.description,
      // Already a zone-qualified instant (the browser converted it, and the
      // check above refused anything that wasn't) -- store it as-is.
      starts_at: values.startsAt,
      ends_at: values.endsAt,
      location: values.location,
      location_url: values.locationUrl,
      price: values.price,
      court_count: values.courtCount,
      max_participants: values.maxParticipants,
      waitlist_capacity: values.waitlistCapacity,
      registration_state: values.registrationState,
      status: values.status,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    // 42501 is an RLS refusal: a member tried to create a session.
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not create the session.");
  }

  // Best-effort: the sessions_add_owner trigger has already written the
  // session_hosts row by the time this runs, so the host can insert courts.
  // A failure here isn't fatal -- the host still has the manual "Add court"
  // control on the manage page (see lib/actions/courts.ts) as the override.
  await supabase.from("courts").insert(
    Array.from({ length: values.courtCount }, (_, i) => ({
      session_id: data.id,
      court_number: i + 1,
    })),
  );

  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  return ok({ id: data.id });
}
