"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "@/lib/validation/auth";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { safeNext } from "@/lib/auth/redirect";

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured;
  // Silently falling back in production would mail every confirmation link
  // (and hand Google every OAuth redirectTo) to localhost, with no build
  // failure and no error until a user reports a broken link. Fail loudly
  // instead. Local dev is unaffected: NEXT_PUBLIC_SITE_URL is always set
  // there via .env.local.
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
  }
  return "http://127.0.0.1:3000";
}

export async function signIn(input: SignInInput, next?: string): Promise<ActionResult<null>> {
  // re-parse server-side: the client resolver is a convenience, not a guarantee
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Supabase deliberately does not distinguish a wrong password from a
    // missing account. Do not try to; that difference is an account-enumeration
    // oracle.
    return fail("not_authenticated", "Email or password is incorrect.");
  }

  redirect(safeNext(next));
}

export async function signUp(input: SignUpInput): Promise<ActionResult<{ needsConfirmation: true }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // handle_new_user copies full_name out of raw_user_meta_data into profiles
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    return fail("unknown", "We could not create that account. Please try again.");
  }

  // Confirmation is required, so no session exists yet. Always report the same
  // outcome whether or not the address was already registered -- saying "that
  // email is taken" would leak membership.
  return ok({ needsConfirmation: true as const });
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signInWithGoogle(next?: string): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
    },
  });

  if (error || !data.url) {
    // Expected until GOOGLE_CLIENT_ID/GOOGLE_SECRET exist and
    // [auth.external.google] enabled is flipped to true.
    return fail("unknown", "Google sign-in is not available yet.");
  }

  redirect(data.url);
}
