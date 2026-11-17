import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getSiteUrl } from "@/lib/seo/urls";
import { EMAIL_TEMPLATES, type EmailContext } from "@/lib/email/templates/registry";

export type DrainResult = { sent: number; failed: number; skipped: number };

type Deps = {
  resend?: Pick<Resend, "emails">;
  supabase?: SupabaseClient<Database>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const BATCH_SIZE = 10;
const MAX_BATCHES = 10;
const SEND_INTERVAL_MS = 600;
const TIME_BUDGET_MS = 45_000;
const LIMIT_ERROR_NAMES = new Set([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]);

class SendLimitError extends Error {}

function isSendLimit(error: { name?: string; statusCode?: number | null }): boolean {
  return error.statusCode === 429 || LIMIT_ERROR_NAMES.has(error.name ?? "");
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Drains email_outbox: claims pending rows in batches of BATCH_SIZE, renders and
// sends them through Resend, then closes each one (sent_at) or marks it failed
// (last_error only). A failed row keeps claimed_at, so the 10-minute stale window
// in claim_email_outbox is its backoff and the same drain never claims it again.
// Never throws: the action or cron that called it has already done its work.
//
// Rate-limit and quota errors from Resend stop the drain and do not count as an
// attempt: the row that hit the error and every claimed-but-untried row get their
// attempt back. The same happens to untried rows when the TIME_BUDGET_MS wall-clock
// budget (checked before each claim and before each row) runs out. No row loses an
// attempt unless a send was really made for it.
//
// Claim is atomic in claim_email_outbox (FOR UPDATE SKIP LOCKED), so concurrent
// drains never email the same row twice; row.id is also the Resend idempotency
// key as a second line of defence.
export async function drainEmailOutbox(deps: Deps = {}): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, failed: 0, skipped: 0 };

  try {
    const siteUrl = getSiteUrl();
    const domain = process.env.RESEND_EMAIL_DOMAIN;
    if ((!deps.resend && !process.env.RESEND_API_KEY) || !domain || !siteUrl) {
      console.error("email outbox: email configuration missing, drain skipped");
      return result;
    }

    let supabase = deps.supabase;
    if (!supabase) {
      // Lazy: service.ts imports "server-only", which must not load in unit tests
      // that inject their own client.
      supabase = (await import("@/lib/supabase/service")).createServiceClient();
    }
    const db = supabase;
    const resend = deps.resend ?? new Resend(process.env.RESEND_API_KEY);
    const sleep = deps.sleep ?? defaultSleep;
    const now = deps.now ?? Date.now;
    const startedAt = now();
    const budgetExpired = () => now() - startedAt >= TIME_BUDGET_MS;
    const from = `Jakbar Twogether <no-reply@${domain}>`;

    const close = async (id: string, patch: { sent_at?: string; last_error?: string }) => {
      const { error } = await db.from("email_outbox").update(patch).eq("id", id);
      if (error) console.error("email outbox: close failed", id, error.message);
    };
    const fail = async (id: string, message: string) => {
      const { error } = await db.from("email_outbox").update({ last_error: message }).eq("id", id);
      if (error) console.error("email outbox: fail mark failed", id, error.message);
    };
    const giveBack = async (
      row: { id: string; attempts: number },
      patch: { claimed_at?: null; last_error?: string },
    ) => {
      const { error } = await db
        .from("email_outbox")
        .update({ attempts: row.attempts - 1, ...patch })
        .eq("id", row.id);
      if (error) console.error("email outbox: give back failed", row.id, error.message);
    };

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      if (budgetExpired()) return result;
      const { data: rows, error: claimError } = await db.rpc("claim_email_outbox", {
        p_limit: BATCH_SIZE,
      });
      if (claimError) {
        console.error("email outbox: claim failed", claimError.message);
        return result;
      }

      const claimed = rows ?? [];
      for (let i = 0; i < claimed.length; i += 1) {
        const row = claimed[i];
        if (budgetExpired()) {
          for (const untried of claimed.slice(i)) await giveBack(untried, { claimed_at: null });
          return result;
        }
        let sendAttempted = false;
        try {
          const { data: session, error: sessionError } = await db
            .from("sessions")
            .select("id, title, starts_at, ends_at, location, status")
            .eq("id", row.session_id)
            .maybeSingle();
          if (sessionError || !session) {
            throw new Error(sessionError?.message ?? "session not found");
          }

          const ended = new Date(session.ends_at).getTime() < Date.now();
          const cancelledStale = session.status === "cancelled" && row.type !== "session_cancelled";
          if (ended || cancelledStale) {
            await close(row.id, { sent_at: new Date().toISOString(), last_error: "stale" });
            result.skipped += 1;
            continue;
          }

          const { data: profile } = await db
            .from("profiles")
            .select("full_name")
            .eq("id", row.user_id)
            .maybeSingle();

          const { data: userData, error: userError } = await db.auth.admin.getUserById(row.user_id);
          const email = userData?.user?.email;
          if (userError || !email) throw new Error(userError?.message ?? "no email for user");

          const template = EMAIL_TEMPLATES[row.type];
          const payload =
            row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
              ? (row.payload as Record<string, unknown>)
              : {};
          const ctx: EmailContext = {
            name: profile?.full_name ?? null,
            sessionTitle: session.title,
            startsAt: session.starts_at,
            endsAt: session.ends_at,
            location: session.location,
            sessionUrl: `${siteUrl}/sessions/${session.id}`,
            profileUrl: `${siteUrl}/profile`,
            payload,
          };
          const html = await render(createElement(template.Component, { ctx }));

          sendAttempted = true;
          const { error: sendError } = await resend.emails.send(
            { from, to: [email], subject: template.subject(ctx), html },
            { idempotencyKey: row.id },
          );
          if (sendError) {
            if (isSendLimit(sendError)) throw new SendLimitError(sendError.message);
            throw new Error(sendError.message);
          }

          await close(row.id, { sent_at: new Date().toISOString() });
          result.sent += 1;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          result.failed += 1;
          if (e instanceof SendLimitError) {
            console.error("email outbox: send limit reached, drain stopped", row.id, message);
            await giveBack(row, { last_error: message });
            for (const untried of claimed.slice(i + 1)) {
              await giveBack(untried, { claimed_at: null });
            }
            return result;
          }
          console.error("email outbox: send failed", row.id, message);
          await fail(row.id, message);
        }
        if (sendAttempted) await sleep(SEND_INTERVAL_MS);
      }

      if (claimed.length < BATCH_SIZE) break;
    }
  } catch (e) {
    console.error("email outbox: unexpected failure", e instanceof Error ? e.message : e);
  }

  return result;
}
