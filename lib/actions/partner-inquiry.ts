"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { fail, type ActionResult } from "@/lib/actions/result";
import { submitInquiryCore } from "@/lib/partner/submit-inquiry";
import { sendPartnerInquiryEmail } from "@/lib/email/send-partner-inquiry";
import type { PartnerInquiryInput } from "@/lib/validation/partner-inquiry";

export async function submitPartnerInquiry(input: PartnerInquiryInput): Promise<ActionResult<null>> {
  const salt = process.env.INQUIRY_IP_SALT;
  if (!salt) {
    // Never hash with an empty salt: the IP space is small enough to reverse.
    console.error("[partner-inquiry] INQUIRY_IP_SALT is not set");
    return fail("unknown");
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || null;

  return submitInquiryCore(input, {
    supabase: createServiceClient(),
    ip,
    salt,
    sendEmail: (id) => sendPartnerInquiryEmail(id),
  });
}
