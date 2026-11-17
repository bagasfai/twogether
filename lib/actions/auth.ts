"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from "@/lib/validation/auth";
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
      // handle_new_user copies full_name/phone out of raw_user_meta_data into
      // profiles/profiles_private
      data: { full_name: parsed.data.fullName, phone: parsed.data.phone },
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

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  // No `next` on the link: app/auth/confirm sends every recovery link to
  // /reset-password regardless (see confirmDestination).
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm`,
  });

  // Same outcome whether the address has an account, has none, or was
  // rate-limited -- any difference is an account-enumeration oracle. The
  // per-address send throttle in particular only trips for a real account.
  if (error) console.error("[auth] resetPasswordForEmail", error.code ?? error.message);

  return ok({ sent: true as const });
}

export async function updatePassword(input: ResetPasswordInput): Promise<ActionResult<null>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail("not_authenticated", "That reset link has expired. Request a new one.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return fail("validation", undefined, {
        password: ["Choose a password different from your current one"],
      });
    }
    return fail("unknown", "We could not update your password. Please try again.");
  }

  // Whoever else holds a session on this account -- the reason for a reset may
  // be that someone does -- is signed out. This session stays.
  await supabase.auth.signOut({ scope: "others" });

  redirect("/dashboard");
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
