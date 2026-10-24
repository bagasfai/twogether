import { z } from "zod";

// Bounds mirror the DB check constraints on membership_plans / memberships;
// an override that slips past these surfaces as Postgres 23514.
const priceIdr = z.number().int().min(0);
const quota = z.number().int().min(1);
const durationDays = z.number().int().min(1);

export const planSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name must be at most 120 characters"),
  priceIdr,
  quota,
  durationDays,
  refundCutoffHours: z.number().int().min(0).default(24),
  isActive: z.boolean(),
});

export const grantMembershipSchema = z.object({
  userId: z.uuid(),
  planId: z.uuid(),
  paymentReceivedAt: z.iso.datetime({ offset: true }),
  priceIdr: priceIdr.optional(),
  quota: quota.optional(),
  durationDays: durationDays.optional(),
});

export type PlanInput = z.input<typeof planSchema>;
export type GrantMembershipInput = z.infer<typeof grantMembershipSchema>;
