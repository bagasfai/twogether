// Supabase Auth "Send Email" hook. Once [auth.hook.send_email] is enabled,
// Auth stops sending its own templated emails and calls this function
// instead for every auth email it would otherwise send -- so every
// email_action_type must be handled or explicitly rejected here.
//
// Only `signup` has a real flow in this app: app/auth/confirm/route.ts only
// accepts type=email (see ALLOWED_OTP_TYPES there), and there is no
// email-change, password-reset, or magic-link UI yet. Anything else throws
// rather than emailing a link the app can't handle -- widen this switch only
// when a route exists to receive the result.
import { Webhook } from "npm:standardwebhooks@^1";
import { render } from "npm:@react-email/render@^2";
import React from "npm:react@^19";
import { Resend } from "npm:resend@^6";

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

    if (email_action_type !== "signup") {
      throw new Error(`email_action_type "${email_action_type}" has no handler yet`);
    }

    // redirect_to is the emailRedirectTo passed to supabase.auth.signUp()
    // (see lib/actions/auth.ts) -- already `${siteUrl}/auth/confirm?next=...`.
    // Append the verification params that route expects rather than hand-
    // building the URL, so this stays correct if `next` ever changes.
    const confirmUrl = new URL(redirect_to || site_url);
    confirmUrl.searchParams.set("token_hash", token_hash);
    confirmUrl.searchParams.set("type", "email");

    const html = await render(
      React.createElement(SignUpEmail, {
        fullName: user.user_metadata.full_name || null,
        confirmUrl: confirmUrl.toString(),
      })
    );

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [user.email],
      subject: "Konfirmasi akun Jakbar Twogether kamu",
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
