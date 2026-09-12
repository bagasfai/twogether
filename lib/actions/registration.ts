"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, ok, type ActionResult } from "@/lib/actions/result";

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
