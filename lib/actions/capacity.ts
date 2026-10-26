"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { adjustCapacitySchema } from "@/lib/validation/drilling";

// Changing the coach count resizes a drilling session: capacity, court count and
// waitlist promotion all happen inside adjust_session_capacity under the session
// advisory lock. Never recompute any of that here.
export async function adjustCoachCount(
  sessionId: string,
  coachCount: number,
): Promise<ActionResult<null>> {
  const parsed = adjustCapacitySchema.safeParse({ sessionId, coachCount });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_session_capacity", {
    p_session_id: parsed.data.sessionId,
    p_coach_count: parsed.data.coachCount,
  });

  if (error) return failFromRpc(error);

  revalidatePath(`/sessions/${parsed.data.sessionId}/manage`);
  revalidatePath("/dashboard");
  return ok(null);
}
