import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmDestination, parseOtpType } from "@/lib/auth/otp";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    // redirect() throws to unwind, so it must sit outside the error branch
    if (!error) redirect(confirmDestination(type, searchParams.get("next")));
  }

  redirect("/auth/error?reason=invalid_link");
}
