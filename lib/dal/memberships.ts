import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { deriveMembershipStatus, type MembershipStatus } from "@/lib/memberships/status";

export { deriveMembershipStatus };
export type { MembershipStatus };

export type PlanRow = {
  id: string;
  name: string;
  priceIdr: number;
  quota: number;
  durationDays: number;
  refundCutoffHours: number;
  isActive: boolean;
};

export type AdminMembershipRow = {
  id: string;
  userId: string;
  memberName: string | null;
  planName: string | null;
  quotaTotal: number;
  quotaUsed: number;
  startedAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
  status: MembershipStatus;
};

export type MyMembershipRow = {
  id: string;
  planName: string | null;
  quotaTotal: number;
  quotaUsed: number;
  quotaLeft: number;
  startedAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
  status: MembershipStatus;
};

type UsageEmbed = { refunded_at: string | null }[] | null;

// Quota used = usage rows not refunded.
function countUsed(usages: UsageEmbed): number {
  return (usages ?? []).filter((u) => u.refunded_at === null).length;
}

// Admin: all plans. Everyone else: active plans only. RLS enforces the same
// split; the filter here keeps the intent explicit.
export async function listPlans(): Promise<PlanRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  let query = supabase
    .from("membership_plans")
    .select("id, name, price_idr, quota, duration_days, refund_cutoff_hours, is_active")
    .order("price_idr", { ascending: true });
  if (user.role !== "admin") query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    priceIdr: p.price_idr,
    quota: p.quota,
    durationDays: p.duration_days,
    refundCutoffHours: p.refund_cutoff_hours,
    isActive: p.is_active,
  }));
}

export async function listMembershipsForAdmin(): Promise<AdminMembershipRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, user_id, quota_total, started_at, expires_at, cancelled_at, created_at, member:profiles!memberships_user_id_fkey(full_name), plan:membership_plans(name), usages:membership_usages(refunded_at)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  const now = new Date();
  return (data ?? []).map((m) => {
    const quotaUsed = countUsed(m.usages);
    return {
      id: m.id,
      userId: m.user_id,
      memberName: m.member?.full_name ?? null,
      planName: m.plan?.name ?? null,
      quotaTotal: m.quota_total,
      quotaUsed,
      startedAt: m.started_at,
      expiresAt: m.expires_at,
      cancelledAt: m.cancelled_at,
      status: deriveMembershipStatus(
        {
          cancelledAt: m.cancelled_at,
          startedAt: m.started_at,
          expiresAt: m.expires_at,
          quotaTotal: m.quota_total,
          quotaUsed,
        },
        now,
      ),
    };
  });
}

export async function getMyMemberships(): Promise<MyMembershipRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, quota_total, started_at, expires_at, cancelled_at, created_at, plan:membership_plans(name), usages:membership_usages(refunded_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const now = new Date();
  return (data ?? []).map((m) => {
    const quotaUsed = countUsed(m.usages);
    return {
      id: m.id,
      planName: m.plan?.name ?? null,
      quotaTotal: m.quota_total,
      quotaUsed,
      quotaLeft: Math.max(0, m.quota_total - quotaUsed),
      startedAt: m.started_at,
      expiresAt: m.expires_at,
      cancelledAt: m.cancelled_at,
      status: deriveMembershipStatus(
        {
          cancelledAt: m.cancelled_at,
          startedAt: m.started_at,
          expiresAt: m.expires_at,
          quotaTotal: m.quota_total,
          quotaUsed,
        },
        now,
      ),
    };
  });
}
