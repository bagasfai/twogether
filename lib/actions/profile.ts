"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { profileSchema, setAvatarSchema, type ProfileInput } from "@/lib/validation/profile";
import { avatarPublicUrl } from "@/lib/avatar/url";
import { avatarObjectPath } from "@/lib/avatar/image";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

export async function updateProfile(input: ProfileInput): Promise<ActionResult<null>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Two tables, two policies: profiles_update_self_or_admin covers the name, profiles_private_update_self covers the phone and gender. Neither write can
  // touch anyone else's row even if user.id were wrong -- RLS decides, not this
  // eq() filter.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id);

  if (profileError) return fail("unknown", "Could not save your profile.");

  // The row is guaranteed to exist: handle_new_user creates it with the profile.
  const { error: phoneError } = await supabase
    .from("profiles_private")
    .update({
      phone: parsed.data.phone,
      // Only written when provided, so saving without a gender never clears one.
      ...(parsed.data.gender ? { gender: parsed.data.gender } : {}),
    })
    .eq("user_id", user.id);

  if (phoneError) return fail("unknown", "Could not save your phone number and gender.");

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return ok(null);
}

const AVATAR_BUCKET = "avatars";

export async function setAvatar(
  input: z.input<typeof setAvatarSchema>,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const parsed = setAvatarSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const { ext, version } = parsed.data;
  const avatarUrl = avatarPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, user.id, ext, version);

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (error) return fail("unknown", "Could not save your photo.");

  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([avatarObjectPath(user.id, ext === "webp" ? "jpg" : "webp")]);
  } catch {}

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return ok({ avatarUrl });
}

export async function removeAvatar(): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  try {
    const { error: removeError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([avatarObjectPath(user.id, "webp"), avatarObjectPath(user.id, "jpg")]);
    if (removeError) return fail("unknown", "Could not remove your photo.");
  } catch {
    return fail("unknown", "Could not remove your photo.");
  }

  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return fail("unknown", "Could not save your photo.");

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return ok(null);
}
