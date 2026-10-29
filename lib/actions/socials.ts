"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import {
  socialLinkIdSchema,
  socialLinkMoveSchema,
  socialLinkSchema,
  type SocialLinkInput,
} from "@/lib/validation/socials";
import { socialRevalidationPaths } from "@/lib/socials/revalidate";
import {
  fail,
  failFromRpc,
  failFromZod,
  ok,
  type ActionResult,
} from "@/lib/actions/result";

// Authorization is RLS / is_admin() inside the RPCs. The getCurrentUser check
// below is only a UX convenience for a clean not_authenticated result.

function revalidateSocials() {
  for (const { path, type } of socialRevalidationPaths()) {
    revalidatePath(path, type);
  }
  revalidatePath("/admin");
}

export async function createSocialLink(
  input: SocialLinkInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = socialLinkSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("social_link_create", {
    p_platform: parsed.data.platform,
    p_url: parsed.data.url,
    p_label: parsed.data.label,
    p_is_visible: parsed.data.isVisible,
  });
  if (error) return failFromRpc(error);

  revalidateSocials();
  return ok({ id: data });
}

export async function updateSocialLink(
  id: string,
  input: SocialLinkInput,
): Promise<ActionResult<null>> {
  const idParsed = socialLinkIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid link id.");

  const parsed = socialLinkSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_links")
    .update({
      platform: parsed.data.platform,
      url: parsed.data.url,
      label: parsed.data.label,
      is_visible: parsed.data.isVisible,
    })
    .eq("id", idParsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the social link.");
  }
  // RLS filters a non-admin's update to zero rows rather than raising.
  if (!data) return fail("not_authorized");

  revalidateSocials();
  return ok(null);
}

export async function moveSocialLink(input: {
  id: string;
  direction: "up" | "down";
}): Promise<ActionResult<null>> {
  const parsed = socialLinkMoveSchema.safeParse(input);
  if (!parsed.success) return fail("validation", "Invalid move.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("social_link_move", {
    p_id: parsed.data.id,
    p_direction: parsed.data.direction,
  });
  if (error) return failFromRpc(error);

  revalidateSocials();
  return ok(null);
}

export async function deleteSocialLink(id: string): Promise<ActionResult<null>> {
  const idParsed = socialLinkIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid link id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("social_link_delete", { p_id: idParsed.data.id });
  if (error) return failFromRpc(error);

  revalidateSocials();
  return ok(null);
}
