export type MembershipStatus = "queued" | "active" | "exhausted" | "expired" | "cancelled";

export type MembershipStatusInput = {
  cancelledAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  quotaTotal: number;
  quotaUsed: number;
};

// Precedence (first match wins): cancelled, queued (startedAt null),
// exhausted (quotaUsed >= quotaTotal), expired (expiresAt <= now), else active.
// So exhausted beats expired, and queued beats exhausted only while startedAt
// is null. Kept free of server-only so unit tests can import it.
export function deriveMembershipStatus(row: MembershipStatusInput, now: Date): MembershipStatus {
  if (row.cancelledAt) return "cancelled";
  if (!row.startedAt) return "queued";
  if (row.quotaUsed >= row.quotaTotal) return "exhausted";
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}
