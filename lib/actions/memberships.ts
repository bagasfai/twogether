"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, failFromZod, ok, type ActionFailure } from "@/lib/actions/result";
import type { ActionResult } from "@/lib/actions/result";
import {
  grantMembershipSchema,
  planSchema,
  type GrantMembershipInput,
  type PlanInput,
} from "@/lib/validation/memberships";

// RLS (plans) and the security-definer RPCs (grant/cancel) are the real
// authorization; the admin check here is UX.
async function adminGuard(): Promise<ActionFailure | null> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");
  if (user.role !== "admin") return fail("not_authorized");
  return null;
}

// Plain insert/update, not an RPC: plans have no concurrency property to protect.
export async function savePlan(id: string | null, input: PlanInput): Promise<ActionResult<null>> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  if (id !== null && !z.uuid().safeParse(id).success) return fail("validation", "Invalid plan id.");

  const denied = await adminGuard();
  if (denied) return denied;

  const row = {
    name: parsed.data.name,
    price_idr: parsed.data.priceIdr,
    quota: parsed.data.quota,
    duration_days: parsed.data.durationDays,
    refund_cutoff_hours: parsed.data.refundCutoffHours,
    is_active: parsed.data.isActive,
  };

  const supabase = await createClient();
  const { error } =
    id === null
      ? await supabase.from("membership_plans").insert(row)
      : await supabase.from("membership_plans").update(row).eq("id", id);

  if (error) return fail("unknown", "Could not save that plan.");

  revalidatePath("/admin");
  return ok(null);
}

export async function grantMembership(input: GrantMembershipInput): Promise<ActionResult<null>> {
  const parsed = grantMembershipSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const denied = await adminGuard();
  if (denied) return denied;

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_membership", {
    p_user_id: d.userId,
    p_plan_id: d.planId,
    p_payment_received_at: d.paymentReceivedAt,
    p_price_idr: d.priceIdr,
    p_quota: d.quota,
    p_duration_days: d.durationDays,
  });
  if (error) return failFromRpc(error);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return ok(null);
}

export async function cancelMembership(membershipId: string): Promise<ActionResult<null>> {
  const parsed = z.uuid().safeParse(membershipId);
  if (!parsed.success) return failFromZod(parsed.error);

  const denied = await adminGuard();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_membership", { p_membership_id: parsed.data });
  if (error) return failFromRpc(error);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return ok(null);
}
