"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import {
  featuredPostImagePathSchema,
  featuredPostSchema,
  type FeaturedPostInput,
} from "@/lib/validation/socials";
import { socialRevalidationPaths } from "@/lib/socials/revalidate";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

// Authorization is RLS (admin-only grants and storage policies). The
// getCurrentUser check is only a UX convenience for a clean not_authenticated.

const BUCKET = "featured-posts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateSocials() {
  for (const { path, type } of socialRevalidationPaths()) {
    revalidatePath(path, type);
  }
  revalidatePath("/admin");
}

// Storage cleanup runs after the row change; a failure leaves an unreferenced
// object, which is logged rather than surfaced.
async function removeObject(supabase: Supabase, path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("[featured-posts] could not remove file", path, error.message);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createFeaturedPost(
  input: FeaturedPostInput & { imagePath: string },
): Promise<ActionResult<{ id: string }>> {
  const { imagePath, ...rest } = input;
  const pathParsed = featuredPostImagePathSchema.safeParse(imagePath);
  if (!pathParsed.success) return fail("validation", "Invalid image.");
  const parsed = featuredPostSchema.safeParse(rest);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("featured_posts")
    .insert({
      platform: parsed.data.platform,
      post_url: parsed.data.postUrl,
      image_path: pathParsed.data,
      caption_en: parsed.data.captionEn,
      caption_id: parsed.data.captionId,
      kind: parsed.data.kind,
      posted_at: parsed.data.postedAt,
      is_visible: parsed.data.isVisible,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not add the post.");
  }

  revalidateSocials();
  return ok({ id: data.id });
}

export async function updateFeaturedPost(
  id: string,
  input: FeaturedPostInput & { imagePath?: string },
): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("validation", "Invalid post id.");
  const { imagePath, ...rest } = input;
  let newPath: string | undefined;
  if (imagePath !== undefined) {
    const pathParsed = featuredPostImagePathSchema.safeParse(imagePath);
    if (!pathParsed.success) return fail("validation", "Invalid image.");
    newPath = pathParsed.data;
  }
  const parsed = featuredPostSchema.safeParse(rest);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Read the old path first so it can be removed once the row points elsewhere.
  const { data: existing, error: readError } = await supabase
    .from("featured_posts")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  if (readError) return fail("unknown", "Could not update the post.");
  if (!existing) return fail("not_authorized");

  const { data, error } = await supabase
    .from("featured_posts")
    .update({
      platform: parsed.data.platform,
      post_url: parsed.data.postUrl,
      caption_en: parsed.data.captionEn,
      caption_id: parsed.data.captionId,
      kind: parsed.data.kind,
      posted_at: parsed.data.postedAt,
      is_visible: parsed.data.isVisible,
      ...(newPath ? { image_path: newPath } : {}),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the post.");
  }
  // RLS filters a non-admin's update to zero rows rather than raising.
  if (!data) return fail("not_authorized");

  if (newPath && existing.image_path && existing.image_path !== newPath) {
    await removeObject(supabase, existing.image_path);
  }

  revalidateSocials();
  return ok(null);
}

export async function deleteFeaturedPost(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("validation", "Invalid post id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("featured_posts")
    .delete()
    .eq("id", id)
    .select("image_path")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not delete the post.");
  }
  if (!data) return fail("not_authorized");

  if (data.image_path) await removeObject(supabase, data.image_path);

  revalidateSocials();
  return ok(null);
}

// Called by the editor when the browser uploaded an image but the row write
// failed. Skips any object a row still references.
export async function deleteOrphanFeaturedImage(imagePath: string): Promise<void> {
  const parsed = featuredPostImagePathSchema.safeParse(imagePath);
  if (!parsed.success) return;
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("featured_posts")
    .select("id")
    .eq("image_path", parsed.data)
    .maybeSingle();
  if (data) return;

  await removeObject(supabase, parsed.data);
}
