// Supabase Auth "Send Email" hook. Once [auth.hook.send_email] is enabled,
// Auth stops sending its own templated emails and calls this function
// instead for every auth email it would otherwise send -- so every
// email_action_type must be handled or explicitly rejected here.
//
// `signup` and `recovery` have a real flow in this app: app/auth/confirm/route.ts
// accepts type=email and type=recovery (see ALLOWED_OTP_TYPES in
// lib/auth/otp.ts), and there is no email-change or magic-link UI yet.
// Anything else throws rather than emailing a link the app can't handle --
// widen EMAILS only when a route exists to receive the result.
import { Webhook } from "npm:standardwebhooks@^1";
import { render } from "npm:@react-email/render@^2";
import React from "npm:react@^19";
import { Resend } from "npm:resend@^6";

import { RecoveryEmail } from "./_templates/recovery.tsx";
import { SignUpEmail } from "./_templates/signup.tsx";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string).replace("v1,whsec_", "");
const fromAddress = `Jakbar Twogether <no-reply@${Deno.env.get("RESEND_EMAIL_DOMAIN")}>`;

interface HookPayload {
  user: {
    email: string;
    user_metadata: { full_name?: string };
  };
  email_data: {
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

interface EmailSpec {
  // the `type` app/auth/confirm/route.ts hands to verifyOtp()
  otpType: "email" | "recovery";
  subject: string;
  element: (fullName: string | null, url: string) => React.ReactElement;
}

const EMAILS: Record<string, EmailSpec> = {
  signup: {
    otpType: "email",
    subject: "Konfirmasi akun Jakbar Twogether kamu",
    element: (fullName, url) => React.createElement(SignUpEmail, { fullName, confirmUrl: url }),
  },
  recovery: {
    otpType: "recovery",
    subject: "Atur ulang kata sandi Jakbar Twogether kamu",
    element: (fullName, url) => React.createElement(RecoveryEmail, { fullName, resetUrl: url }),
  },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("not allowed", { status: 400 });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  try {
    const {
      user,
      email_data: { token_hash, redirect_to, email_action_type, site_url },
    } = wh.verify(payload, headers) as HookPayload;

    const spec = Object.hasOwn(EMAILS, email_action_type) ? EMAILS[email_action_type] : undefined;
    if (!spec) {
      throw new Error(`email_action_type "${email_action_type}" has no handler yet`);
    }

    // redirect_to is the emailRedirectTo / redirectTo passed to
    // supabase.auth.signUp() or resetPasswordForEmail() (see
    // lib/actions/auth.ts) -- already `${siteUrl}/auth/confirm[?next=...]`.
    // Append the verification params that route expects rather than hand-
    // building the URL, so this stays correct if `next` ever changes.
    const confirmUrl = new URL(redirect_to || site_url);
    confirmUrl.searchParams.set("token_hash", token_hash);
    confirmUrl.searchParams.set("type", spec.otpType);

    const html = await render(
      spec.element(user.user_metadata.full_name || null, confirmUrl.toString())
    );

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [user.email],
      subject: spec.subject,
      html,
    });
    if (error) throw error;
  } catch (error) {
    console.error(error);
    const httpCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: number }).code
        : undefined;
    const message = error instanceof Error ? error.message : "Unauthorized";

    return Response.json({ error: { http_code: httpCode, message } }, { status: 401 });
  }

  return Response.json({}, { status: 200 });
});
