"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { searchAddableMembers, type AddableMember } from "@/lib/dal/participants";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import {
  hostAddParticipantSchema,
  searchMembersSchema,
  setCheckedInSchema,
  setNoShowSchema,
  setPaidSchema,
  setParticipantStatusSchema,
} from "@/lib/validation/participants";
import { checkInBlockedReason } from "@/lib/players/resolve";
import type { Database } from "@/types/supabase";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

// Host override. CLAUDE.md rule 3: every automated flow needs a host-facing
// manual counterpart, and waitlist promotion is already an automatic trigger.
//
// This goes through host_set_participant_status, not a direct UPDATE, even
// though participants_update_host would permit one. The RPC takes the same
// advisory lock as registration, so a host override and a member registration
// racing each other stay serialised.
export async function setParticipantStatus(
  participantId: string,
  sessionId: string,
  status: ParticipantStatus,
): Promise<ActionResult<null>> {
  const parsed = setParticipantStatusSchema.safeParse({ participantId, sessionId, status });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("host_set_participant_status", {
    p_participant_id: parsed.data.participantId,
    p_status: parsed.data.status,
  });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  revalidatePath("/dashboard");
  return ok(null);
}

// Check-in isn't a registration/waitlist decision, so unlike setParticipantStatus
// it doesn't need the advisory-lock RPC -- there's no count to race. A direct
// UPDATE is fine: participants_update_host gates it, and enforce_checkin_requires_active
// nulls checked_in_at server-side the moment status isn't 'confirmed'.
export async function setCheckedIn(
  participantId: string,
  sessionId: string,
  checkedIn: boolean,
): Promise<ActionResult<null>> {
  const parsed = setCheckedInSchema.safeParse({ participantId, sessionId, checkedIn });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Guests can't be checked in until a host has set their gender (the pairing
  // logic needs it). Only applies when checking IN, and only to guests; members
  // carry gender on their profile. Fails closed: any lookup error aborts the
  // check-in, and a missing guest_attributes row means gender is unset.
  if (parsed.data.checkedIn) {
    const { data: row, error: lookupError } = await supabase
      .from("participants")
      .select("guest_name")
      .eq("id", parsed.data.participantId)
      .eq("session_id", parsed.data.sessionId)
      .maybeSingle();

    if (lookupError || !row) return fail("unknown", "Could not update check-in.");

    if (row.guest_name !== null) {
      const { data: attrs, error: attrsError } = await supabase
        .from("guest_attributes")
        .select("gender")
        .eq("participant_id", parsed.data.participantId)
        .maybeSingle();

      if (attrsError) return fail("unknown", "Could not update check-in.");

      const blocked = checkInBlockedReason({ isGuest: true, gender: attrs?.gender ?? null });
      if (blocked) return fail("validation", blocked);
    }
  }

  const { error } = await supabase
    .from("participants")
    .update({ checked_in_at: parsed.data.checkedIn ? new Date().toISOString() : null })
    .eq("id", parsed.data.participantId)
    .eq("session_id", parsed.data.sessionId);

  if (error) return fail("unknown", "Could not update check-in.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}

// Same reasoning as setCheckedIn immediately above: not a capacity-racing
// decision, so a direct UPDATE gated by participants_update_host's row scope
// plus the paid_at column grant (20260917000006) is enough -- no RPC.
export async function setPaid(
  participantId: string,
  sessionId: string,
  paid: boolean,
): Promise<ActionResult<null>> {
  const parsed = setPaidSchema.safeParse({ participantId, sessionId, paid });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("participants")
    .update({ paid_at: parsed.data.paid ? new Date().toISOString() : null })
    .eq("id", parsed.data.participantId)
    .eq("session_id", parsed.data.sessionId);

  if (error) return fail("unknown", "Could not update payment status.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}

// Same reasoning as setPaid immediately above: not a capacity-racing
// decision, so a direct UPDATE gated by participants_update_host's row scope
// plus the no_show_at column grant (20260924000001) is enough -- no RPC.
// The roster UI only surfaces this once the session is completed, but that's
// a UI-layer gate, not enforced here -- a host can correct a no-show mark at
// any time (manual override, rule 3).
export async function setNoShow(
  participantId: string,
  sessionId: string,
  noShow: boolean,
): Promise<ActionResult<null>> {
  const parsed = setNoShowSchema.safeParse({ participantId, sessionId, noShow });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("participants")
    .update({ no_show_at: parsed.data.noShow ? new Date().toISOString() : null })
    .eq("id", parsed.data.participantId)
    .eq("session_id", parsed.data.sessionId);

  if (error) return fail("unknown", "Could not update no-show status.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}

// Host override, same rule-3 rationale as setParticipantStatus above. Unlike
// that action this can create a participant row, not just change one -- see
// docs/superpowers/core-schema-follow-ups.md's "must decide" entry on
// host_add_participant. The RPC deliberately leaves the new row's
// consented_at null; the member sees a "confirm your spot" prompt on their
// dashboard (confirmParticipation in lib/actions/registration.ts) before any
// host can read their phone number through profiles_private.
export async function hostAddParticipant(
  sessionId: string,
  userId: string,
  status: Exclude<ParticipantStatus, "cancelled">,
): Promise<ActionResult<null>> {
  const parsed = hostAddParticipantSchema.safeParse({ sessionId, userId, status });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("host_add_participant", {
    p_session_id: parsed.data.sessionId,
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
  });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}

export async function searchMembers(sessionId: string, query: string): Promise<ActionResult<AddableMember[]>> {
  const parsed = searchMembersSchema.safeParse({ sessionId, query });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const results = await searchAddableMembers(parsed.data.sessionId, parsed.data.query);
  return ok(results);
}
