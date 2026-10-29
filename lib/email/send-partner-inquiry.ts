import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSiteUrl } from "@/lib/seo/urls";
import { PartnerInquiryEmail } from "@/lib/email/partner-inquiry-email";

type Deps = {
  resend?: Pick<Resend, "emails">;
  supabase?: SupabaseClient<Database>;
};

// Emails the partner inbox about one new inquiry. Best effort, never throws.
// Claim-then-send like send-bump-notifications: the UPDATE ... WHERE
// email_sent_at IS NULL is atomic, so only one caller emails a given inquiry.
// A failed send releases the claim so it can be retried.
export async function sendPartnerInquiryEmail(
  id: string,
  deps: Deps = {},
): Promise<{ sent: boolean }> {
  let claimed = false;
  let supabase = deps.supabase;
  try {
    const to = process.env.PARTNER_INBOX_EMAIL;
    if (!to) {
      console.warn("partner inquiry email: PARTNER_INBOX_EMAIL is unset, skipping");
      return { sent: false };
    }

    if (!supabase) {
      // Lazy: service.ts imports "server-only", which must not load in unit tests.
      supabase = (await import("@/lib/supabase/service")).createServiceClient();
    }
    const resend = deps.resend ?? new Resend(process.env.RESEND_API_KEY);

    const { data: rows, error: claimError } = await supabase
      .from("partner_inquiries")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", id)
      .is("email_sent_at", null)
      .select("name, organisation, email, whatsapp, inquiry_type, message");
    if (claimError) {
      console.error("partner inquiry email: claim failed", claimError.message);
      return { sent: false };
    }
    const row = rows?.[0];
    if (!row) return { sent: false };
    claimed = true;

    const siteUrl = getSiteUrl();
    const html = await render(
      createElement(PartnerInquiryEmail, {
        name: row.name,
        organisation: row.organisation,
        email: row.email,
        whatsapp: row.whatsapp,
        inquiryType: row.inquiry_type,
        message: row.message,
        adminUrl: siteUrl ? `${siteUrl}/admin` : null,
      }),
    );

    const { error: sendError } = await resend.emails.send({
      from: `Jakbar Twogether <no-reply@${process.env.RESEND_EMAIL_DOMAIN}>`,
      to: [to],
      replyTo: row.email,
      subject: `New partner inquiry: ${row.organisation} (${row.inquiry_type})`,
      html,
    });
    if (sendError) throw new Error(sendError.message);
    return { sent: true };
  } catch (e) {
    console.error("partner inquiry email: send failed", id, e instanceof Error ? e.message : "unknown");
    if (claimed && supabase) {
      try {
        const { error } = await supabase
          .from("partner_inquiries")
          .update({ email_sent_at: null })
          .eq("id", id);
        if (error) console.error("partner inquiry email: release failed", id, error.message);
      } catch {
        console.error("partner inquiry email: release failed", id);
      }
    }
    return { sent: false };
  }
}
