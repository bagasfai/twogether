"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, ok, type ActionResult } from "@/lib/actions/result";
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
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("host_set_participant_status", {
    p_participant_id: participantId,
    p_status: status,
  });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${sessionId}/manage`);
  revalidatePath("/dashboard");
  return ok(null);
}
