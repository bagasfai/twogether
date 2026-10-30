"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import {
  aboutSchema,
  faqItemSchema,
  faqIdSchema,
  faqMoveSchema,
  type AboutInput,
  type FaqItemInput,
} from "@/lib/validation/community-content";
import { communityContentRevalidationPaths } from "@/lib/community-content/revalidate";
import {
  fail,
  failFromRpc,
  failFromZod,
  ok,
  type ActionResult,
} from "@/lib/actions/result";

// Authorization is RLS / is_admin() inside the RPCs. The getCurrentUser check
// below is only a UX convenience for a clean not_authenticated result.

function revalidateCommunityContent() {
  for (const { path, type } of communityContentRevalidationPaths()) {
    revalidatePath(path, type);
  }
}

export async function updateAbout(input: AboutInput): Promise<ActionResult<null>> {
  const parsed = aboutSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_about")
    .update({
      title_en: parsed.data.titleEn,
      title_id: parsed.data.titleId,
      body_en: parsed.data.bodyEn,
      body_id: parsed.data.bodyId,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not save the about page.");
  }
  // RLS filters a non-admin's update to zero rows rather than raising.
  if (!data) return fail("not_authorized");

  revalidateCommunityContent();
  return ok(null);
}

export async function createFaqItem(
  input: FaqItemInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = faqItemSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("faq_create", {
    p_question_en: parsed.data.questionEn,
    p_question_id: parsed.data.questionId,
    p_answer_en: parsed.data.answerEn,
    p_answer_id: parsed.data.answerId,
  });
  if (error) return failFromRpc(error);

  revalidateCommunityContent();
  return ok({ id: data });
}

export async function updateFaqItem(
  id: string,
  input: FaqItemInput,
): Promise<ActionResult<null>> {
  const idParsed = faqIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid FAQ id.");

  const parsed = faqItemSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faq_items")
    .update({
      question_en: parsed.data.questionEn,
      question_id: parsed.data.questionId,
      answer_en: parsed.data.answerEn,
      answer_id: parsed.data.answerId,
    })
    .eq("id", idParsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the FAQ item.");
  }
  // Zero rows: the item is gone, or RLS hid it from a non-admin.
  if (!data) return fail("not_found");

  revalidateCommunityContent();
  return ok(null);
}

export async function deleteFaqItem(id: string): Promise<ActionResult<null>> {
  const idParsed = faqIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid FAQ id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("faq_delete", { p_id: idParsed.data.id });
  if (error) return failFromRpc(error);

  revalidateCommunityContent();
  return ok(null);
}

export async function moveFaqItem(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult<null>> {
  const parsed = faqMoveSchema.safeParse({ id, direction });
  if (!parsed.success) return fail("validation", "Invalid move.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("faq_move", {
    p_id: parsed.data.id,
    p_direction: parsed.data.direction,
  });
  if (error) return failFromRpc(error);

  revalidateCommunityContent();
  return ok(null);
}
