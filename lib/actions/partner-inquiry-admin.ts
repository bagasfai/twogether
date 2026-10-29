"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import {
  partnerInquiryStatusSchema,
  type PARTNER_INQUIRY_STATUSES,
} from "@/lib/validation/partner-inquiry";
import { fail, ok, type ActionResult } from "@/lib/actions/result";

export type PartnerInquiryStatus = (typeof PARTNER_INQUIRY_STATUSES)[number];

// Authorization is RLS (is_admin(), UPDATE on status only). The getCurrentUser
// check is a UX convenience for a clean not_authenticated result.
export async function setPartnerInquiryStatus(input: {
  id: string;
  status: PartnerInquiryStatus;
}): Promise<ActionResult<null>> {
  const parsed = partnerInquiryStatusSchema.safeParse(input);
  if (!parsed.success) return fail("validation", "Invalid inquiry status.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_inquiries")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the inquiry status.");
  }
  // RLS filters a non-admin's update to zero rows rather than raising.
  if (!data) return fail("not_authorized");

  revalidatePath("/admin");
  return ok(null);
}
