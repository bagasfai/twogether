import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type PartnerInquiryRow = Database["public"]["Tables"]["partner_inquiries"]["Row"];

export type PartnerInquiry = {
  id: string;
  name: string;
  organisation: string;
  email: string;
  whatsapp: string;
  inquiryType: PartnerInquiryRow["inquiry_type"];
  message: string;
  status: PartnerInquiryRow["status"];
  emailSentAt: string | null;
  createdAt: string;
};

// Newest first; filtering by status happens in the client.
export async function listPartnerInquiriesForAdmin(): Promise<PartnerInquiry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_inquiries")
    .select(
      "id, name, organisation, email, whatsapp, inquiry_type, message, status, email_sent_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load partner inquiries: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    organisation: row.organisation,
    email: row.email,
    whatsapp: row.whatsapp,
    inquiryType: row.inquiry_type,
    message: row.message,
    status: row.status,
    emailSentAt: row.email_sent_at,
    createdAt: row.created_at,
  }));
}

export async function countNewPartnerInquiries(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("partner_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error) throw new Error(`Failed to count partner inquiries: ${error.message}`);
  return count ?? 0;
}
