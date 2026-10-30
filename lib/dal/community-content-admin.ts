import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AboutRow, FaqRow } from "@/lib/community-content/locale";

export async function getAboutForAdmin(): Promise<AboutRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("community_about").select("*").maybeSingle();
  if (error) throw new Error(`Failed to load about page: ${error.message}`);
  return data;
}

export async function listFaqItemsForAdmin(): Promise<FaqRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faq_items")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to load FAQ items: ${error.message}`);
  return data ?? [];
}
