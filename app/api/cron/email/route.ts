import { timingSafeEqual } from "node:crypto";
import { drainEmailOutbox } from "@/lib/email/drain-outbox";
import { createServiceClient } from "@/lib/supabase/service";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let queued = 0;
  try {
    const { data, error } = await createServiceClient().rpc("queue_session_reminders");
    if (error) {
      console.error("email cron: queue_session_reminders failed", error.message);
    } else {
      queued = data ?? 0;
    }
  } catch (error) {
    console.error("email cron: queue_session_reminders threw", error);
  }

  const { sent, failed, skipped } = await drainEmailOutbox();
  return Response.json({ queued, sent, failed, skipped });
}
