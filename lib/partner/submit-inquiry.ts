import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { partnerInquirySchema } from "@/lib/validation/partner-inquiry";
import { hashIp } from "@/lib/partner/ip-hash";

export const INQUIRY_LIMIT_PER_HOUR = 3;

export type SubmitInquiryDeps = {
  supabase: SupabaseClient<Database>;
  ip: string | null;
  salt: string;
  now?: () => Date;
  sendEmail: (id: string) => Promise<unknown>;
};

// Public, unauthenticated write path. `supabase` must be the service-role client
// (anon/authenticated have no insert grant). The rate-limit check-then-insert can
// let a burst through by a row or two; that is fine for spam control.
export async function submitInquiryCore(
  input: unknown,
  deps: SubmitInquiryDeps,
): Promise<ActionResult<null>> {
  // Honeypot on the RAW input, before zod: bots get a silent success.
  const rawWebsite = (input as { website?: unknown } | null)?.website;
  if (typeof rawWebsite === "string" && rawWebsite.length > 0) return ok(null);

  const parsed = partnerInquirySchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);
  const v = parsed.data;

  const ipHash = hashIp(deps.ip, deps.salt);
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - 3600 * 1000).toISOString();

  const { count, error: countError } = await deps.supabase
    .from("partner_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (countError) {
    console.error("[partner-inquiry] rate limit count failed", countError.code, countError.message);
    return fail("unknown");
  }
  if ((count ?? 0) >= INQUIRY_LIMIT_PER_HOUR) return fail("rate_limited");

  const { data: row, error: insertError } = await deps.supabase
    .from("partner_inquiries")
    .insert({
      name: v.name,
      organisation: v.organisation,
      email: v.email,
      whatsapp: v.whatsapp,
      inquiry_type: v.inquiryType,
      message: v.message,
      ip_hash: ipHash,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    console.error("[partner-inquiry] insert failed", insertError?.code, insertError?.message);
    return fail("unknown");
  }

  // Best effort: a failed email never fails the submit.
  try {
    await deps.sendEmail(row.id);
  } catch (e) {
    console.error("[partner-inquiry] email failed", e instanceof Error ? e.message : "unknown");
  }
  return ok(null);
}
