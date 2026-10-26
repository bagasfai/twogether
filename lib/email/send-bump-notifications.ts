import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSiteUrl } from "@/lib/seo/urls";
import { BumpEmail } from "@/lib/email/bump-email";

type Deps = {
  resend?: Pick<Resend, "emails">;
  supabase?: SupabaseClient<Database>;
};

// Emails every member moved to the waitlist by a premium bump (rows written by
// register_for_session into bump_notifications). Best effort and never throws:
// the registration that triggered it has already succeeded.
//
// Claim-then-send: the UPDATE ... WHERE sent_at IS NULL is atomic per row, so two
// concurrent callers can never both claim (and email) the same row. A failed
// send or lookup releases the claim (sent_at back to null) so a later call
// retries it.
export async function sendPendingBumpNotifications(
  deps: Deps = {},
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    let supabase = deps.supabase;
    if (!supabase) {
      // Lazy: service.ts imports "server-only", which must not load in unit tests
      // that inject their own client.
      supabase = (await import("@/lib/supabase/service")).createServiceClient();
    }
    const resend = deps.resend ?? new Resend(process.env.RESEND_API_KEY);

    const { data: claimed, error: claimError } = await supabase
      .from("bump_notifications")
      .update({ sent_at: new Date().toISOString() })
      .is("sent_at", null)
      .select("id, participant_id");

    if (claimError) {
      console.error("bump notifications: claim failed", claimError.message);
      return { sent, failed };
    }

    const release = async (id: string) => {
      const { error } = await supabase
        .from("bump_notifications")
        .update({ sent_at: null })
        .eq("id", id);
      if (error) console.error("bump notifications: release failed", id, error.message);
    };

    const siteUrl = getSiteUrl();
    const from = `Jakbar Twogether <no-reply@${process.env.RESEND_EMAIL_DOMAIN}>`;

    for (const row of claimed ?? []) {
      try {
        const { data: participant, error: pError } = await supabase
          .from("participants")
          .select("user_id, sessions(id, title, starts_at)")
          .eq("id", row.participant_id)
          .single();
        const session = participant?.sessions;
        if (pError || !participant?.user_id || !session || !siteUrl) {
          throw new Error(pError?.message ?? "bumped participant, session or site url unavailable");
        }

        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
          participant.user_id,
        );
        const email = userData?.user?.email;
        if (userError || !email) throw new Error(userError?.message ?? "no email for user");

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", participant.user_id)
          .maybeSingle();

        const html = await render(
          createElement(BumpEmail, {
            name: profile?.full_name ?? null,
            sessionTitle: session.title,
            startsAt: session.starts_at,
            sessionUrl: `${siteUrl}/sessions/${session.id}`,
          }),
        );

        const { error: sendError } = await resend.emails.send({
          from,
          to: [email],
          subject: "Kamu dipindah ke daftar tunggu",
          html,
        });
        if (sendError) throw new Error(sendError.message);

        sent += 1;
      } catch (e) {
        failed += 1;
        console.error("bump notifications: send failed", row.id, e instanceof Error ? e.message : e);
        await release(row.id);
      }
    }
  } catch (e) {
    console.error("bump notifications: unexpected failure", e instanceof Error ? e.message : e);
  }

  return { sent, failed };
}
