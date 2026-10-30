import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { pickAbout, pickFaq } from "@/lib/community-content/locale";

export async function getAbout(locale: string): Promise<{ title: string; body: string } | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase.from("community_about").select("*").maybeSingle();

  if (error) throw error;
  return data ? pickAbout(data, locale) : null;
}

export async function listFaqItems(
  locale: string,
): Promise<{ id: string; question: string; answer: string }[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("faq_items")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => pickFaq(row, locale));
}
