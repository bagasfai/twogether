"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { cancelGuestRegistrationSchema, registerGuestSchema } from "@/lib/validation/participants";

export type RegisterOutcome = {
  status: "confirmed" | "waiting_list";
  waitlistPosition: number | null;
};

export async function registerForSession(sessionId: string): Promise<ActionResult<RegisterOutcome>> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // The RPC is the ONLY write path into participants -- the table has no INSERT
  // policy and no INSERT grant on purpose. Everything that makes concurrent
  // registration safe (the advisory lock, the capacity re-read under READ
  // COMMITTED, clock_timestamp() ordering) lives inside this function. Never
  // replace this with an .insert().
  const { data, error } = await supabase.rpc("register_for_session", { p_session_id: sessionId });

  if (error) return failFromRpc(error);

  const status = data?.status;
  if (status !== "confirmed" && status !== "waiting_list") {
    return fail("unknown");
  }

  // The public session page shows capacity, not a live count, so it is not
  // revalidated here -- doing so on every registration would invalidate the ISR
  // cache continuously during a rush.
  revalidatePath("/dashboard");

  return ok({ status, waitlistPosition: data?.waitlist_position ?? null });
}

export async function cancelRegistration(sessionId: string): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Cancelling is also RPC-only. The waitlist promotion that follows is a
  // database trigger on the status change, so it fires identically whether the
  // cancellation came from here or from a host override.
  const { error } = await supabase.rpc("cancel_registration", { p_session_id: sessionId });

  if (error) return failFromRpc(error);

  revalidatePath("/dashboard");
  return ok(null);
}

// Lets a member register someone who has no account of their own (a friend
// or partner they're bringing along). See register_guest_for_session in the
// guest-participants migration -- this is the ONLY write path into a guest
// row for the same reason register_for_session is the only one for a
// member's own: the advisory lock and capacity re-read live inside the RPC.
export async function registerGuestForSession(
  sessionId: string,
  guestName: string,
  guestPhone: string | null,
): Promise<ActionResult<RegisterOutcome>> {
  const parsed = registerGuestSchema.safeParse({ sessionId, guestName, guestPhone });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_guest_for_session", {
    p_session_id: parsed.data.sessionId,
    p_guest_name: parsed.data.guestName,
    p_guest_phone: parsed.data.guestPhone ?? undefined,
  });

  if (error) return failFromRpc(error);

  const status = data?.status;
  if (status !== "confirmed" && status !== "waiting_list") {
    return fail("unknown");
  }

  revalidatePath("/dashboard");

  return ok({ status, waitlistPosition: data?.waitlist_position ?? null });
}

// Companion to registerGuestForSession. Takes a participant id, not
// sessionId alone, because a member can bring more than one guest to the
// same session -- there is no single "my guest registration" row to key off
// the way cancelRegistration keys off user_id.
export async function cancelGuestRegistration(
  participantId: string,
  sessionId: string,
): Promise<ActionResult<null>> {
  const parsed = cancelGuestRegistrationSchema.safeParse({ participantId, sessionId });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_guest_registration", {
    p_participant_id: parsed.data.participantId,
  });

  if (error) return failFromRpc(error);

  revalidatePath("/dashboard");
  return ok(null);
}

// Member-only acknowledgement of a host_add_participant registration --
// see docs/superpowers/core-schema-follow-ups.md's "must decide" entry.
// Declining is just cancelRegistration above; there is no separate "decline"
// RPC because cancel_registration already cancels any participant row the
// caller owns regardless of who created it.
export async function confirmParticipation(sessionId: string): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("member_confirm_participation", { p_session_id: sessionId });

  if (error) return failFromRpc(error);

  revalidatePath("/dashboard");
  return ok(null);
}
