"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { sessionSchema, type SessionInput } from "@/lib/validation/session";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

export async function createSession(input: SessionInput): Promise<ActionResult<{ id: string }>> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const values = parsed.data;

  // sessions_insert_host requires current_user_role() in ('host','admin') AND
  // created_by = auth.uid(). A member reaching this point is refused by RLS,
  // not by any check here. The sessions_add_owner trigger writes the
  // session_hosts owner row.
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      title: values.title,
      description: values.description,
      // datetime-local has no zone; the browser's zone is the intended one
      starts_at: new Date(values.startsAt).toISOString(),
      ends_at: new Date(values.endsAt).toISOString(),
      location: values.location,
      location_url: values.locationUrl,
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

  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  return ok({ id: data.id });
}
