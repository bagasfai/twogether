import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/auth/redirect";

export const RESET_PASSWORD_PATH = "/reset-password";

// Each type here has a flow that receives the result: `email` is signup
// confirmation, `recovery` is the password reset. The send-email hook
// (supabase/functions/send-email) rejects every other email_action_type before
// a link is built. Invite, magic-link and email-change have no flow -- don't
// let an attacker-controlled `type` reach verifyOtp() for those. Widen this
// list only when a route exists to handle the result.
const ALLOWED_OTP_TYPES = ["email", "recovery"] as const satisfies readonly EmailOtpType[];

export type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

export function parseOtpType(value: string | null): AllowedOtpType | null {
  return (ALLOWED_OTP_TYPES as readonly string[]).includes(value ?? "")
    ? (value as AllowedOtpType)
    : null;
}

// A recovery link always lands on the reset page. `next` is ignored for it: a
// verified recovery token signs the user in, and the only thing that session
// was issued for is choosing a new password.
export function confirmDestination(type: AllowedOtpType, next: string | null): string {
  return type === "recovery" ? RESET_PASSWORD_PATH : safeNext(next);
}
