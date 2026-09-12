import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";

// The only email-confirmation flow this app issues links for today is
// signup confirmation, which Supabase's template sends as type=email (see
// supabase/templates/confirmation.html). Recovery, invite, magic-link and
// email-change links have no corresponding flow in this app yet -- don't
// let an attacker-controlled `type` value reach verifyOtp() for those.
// Widen this list only when a route exists to handle the result.
const ALLOWED_OTP_TYPES: readonly EmailOtpType[] = ["email"];

function parseOtpType(value: string | null): EmailOtpType | null {
  return ALLOWED_OTP_TYPES.includes(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    // redirect() throws to unwind, so it must sit outside the error branch
    if (!error) redirect(next);
  }

  redirect("/auth/error?reason=invalid_link");
}
