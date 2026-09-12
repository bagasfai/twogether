"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

export async function updateProfile(input: ProfileInput): Promise<ActionResult<null>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Two tables, two policies: profiles_update_self_or_admin covers the name and
  // avatar, profiles_private_update_self covers the phone. Neither write can
  // touch anyone else's row even if user.id were wrong -- RLS decides, not this
  // eq() filter.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, avatar_url: parsed.data.avatarUrl })
    .eq("id", user.id);

  if (profileError) return fail("unknown", "Could not save your profile.");

  // The row is guaranteed to exist: handle_new_user creates it with the profile.
  const { error: phoneError } = await supabase
    .from("profiles_private")
    .update({ phone: parsed.data.phone })
    .eq("user_id", user.id);

  if (phoneError) return fail("unknown", "Could not save your phone number.");

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return ok(null);
}
