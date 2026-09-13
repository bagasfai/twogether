"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { setCheckedInSchema, setParticipantStatusSchema } from "@/lib/validation/participants";
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
  const { error } = await supabase
    .from("participants")
    .update({ checked_in_at: parsed.data.checkedIn ? new Date().toISOString() : null })
    .eq("id", parsed.data.participantId)
    .eq("session_id", parsed.data.sessionId);

  if (error) return fail("unknown", "Could not update check-in.");

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  return ok(null);
}
