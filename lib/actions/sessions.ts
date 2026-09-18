"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { sessionSchema, sessionIdSchema, isZonedInstant, type SessionInput } from "@/lib/validation/session";
import { getHostSession } from "@/lib/dal/sessions";
import { listRoster } from "@/lib/dal/participants";
import { buildWhatsAppShareText } from "@/lib/format/whatsapp-share";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { sessionUpdatePayload } from "@/lib/actions/session-payload";

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

// Same RLS as createSession (sessions_update_host is column-unrestricted),
// so a plain UPDATE is enough -- no RPC.
export async function updateSession(id: string, input: SessionInput): Promise<ActionResult<null>> {
  const idParsed = sessionIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid session id.");

  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const values = parsed.data;

  const zoneless = (["startsAt", "endsAt"] as const).filter((key) => !isZonedInstant(values[key]));
  if (zoneless.length > 0) {
    return fail(
      "validation",
      "Please pick a start and end time.",
      Object.fromEntries(zoneless.map((key) => [key, ["Missing time zone"]])),
    );
  }

  // The Server Action is a public endpoint: nothing but the UI's canEdit()
  // gating (session-actions-menu.tsx) otherwise stops a stale form
  // submission from writing over a session that moved to live/completed/
  // cancelled since the Edit dialog was opened (e.g. a co-host started it
  // live while this host still had the form open) -- there is no DB
  // trigger enforcing valid status transitions on sessions. Re-fetch the
  // current state and refuse the write if it's no longer editable.
  // getHostSession also re-scopes to sessions this caller hosts, so a
  // caller who was never a host of this session gets the same
  // not_authorized this DAL call already returns to getSessionShareText.
  const current = await getHostSession(idParsed.data.id);
  if (!current) return fail("not_authorized");
  if (current.status !== "draft" && current.status !== "scheduled") {
    return fail(
      "validation",
      "This session can no longer be edited -- its status changed. Reload and try again.",
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("sessions")
    .update(sessionUpdatePayload(values))
    .eq("id", idParsed.data.id);

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the session.");
  }

  revalidatePath(`/sessions/${idParsed.data.id}/manage`);
  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  return ok(null);
}

// A distinct action rather than a value in sessionSchema's status enum
// (which only offers draft/scheduled -- see that schema's comment) so
// ending a session stays a deliberate, separately-confirmed action instead
// of a dropdown option a host could pick by accident while editing the
// title. sessions_select_public_or_host already excludes 'cancelled' from
// the public list, so no extra visibility change is needed here.
export async function cancelSession(id: string): Promise<ActionResult<null>> {
  const idParsed = sessionIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid session id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { error } = await supabase
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", idParsed.data.id);

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not cancel the session.");
  }

  revalidatePath(`/sessions/${idParsed.data.id}/manage`);
  revalidatePath("/dashboard");
  revalidatePath("/sessions");
  return ok(null);
}

// Read-only. getHostSession already scopes to sessions this caller hosts
// (see its comment in lib/dal/sessions.ts) -- returning null there means
// "not a host of this session", surfaced here as not_authorized rather than
// leaking whether the session exists.
export async function getSessionShareText(sessionId: string): Promise<ActionResult<{ text: string }>> {
  const idParsed = sessionIdSchema.safeParse({ id: sessionId });
  if (!idParsed.success) return fail("validation", "Invalid session id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const session = await getHostSession(idParsed.data.id);
  if (!session) return fail("not_authorized");

  const roster = await listRoster(idParsed.data.id);

  const text = buildWhatsAppShareText(
    {
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      location: session.location,
      courtCount: session.courtCount,
      price: session.price,
    },
    roster.map((entry) => ({
      fullName: entry.fullName ?? "Unnamed player",
      status: entry.status,
      paidAt: entry.paidAt,
    })),
  );

  return ok({ text });
}
