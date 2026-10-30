"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { transferSeatSchema } from "@/lib/validation/drilling";

// Hands a seat to another member. The RPC is the only write path and decides
// authorization (owner or host) itself.
export async function transferSeat(
  participantId: string,
  toUserId: string,
): Promise<ActionResult<null>> {
  const parsed = transferSeatSchema.safeParse({ participantId, toUserId });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Read the session id only to know which manage page to revalidate. RLS limits
  // this to rows the caller can see. A miss is not an error here and is not
  // reported as one: the RPC below is the authority and returns the same
  // not_found / not_authorized it would for anyone, so this read can never be
  // used to probe whether a participant id exists.
  const { data: row } = await supabase
    .from("participants")
    .select("session_id")
    .eq("id", parsed.data.participantId)
    .maybeSingle();

  const { error } = await supabase.rpc("transfer_participation", {
    p_participant_id: parsed.data.participantId,
    p_to_user_id: parsed.data.toUserId,
  });

  if (error) return failFromRpc(error);

  if (row?.session_id) revalidatePath(`/sessions/${row.session_id}/manage`);
  revalidatePath("/dashboard");
  return ok(null);
}
