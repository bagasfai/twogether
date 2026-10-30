"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { setUserRoleSchema, type SetUserRoleInput } from "@/lib/validation/admin";

// profiles_update_self_or_admin + guard_profile_role_change are the real
// enforcement; requireAdmin on the /admin page and the checks here are UX,
// not the security boundary. A plain UPDATE, not an RPC: role changes have no
// concurrency property to protect (contrast host_set_participant_status,
// which takes the registration advisory lock).
export async function setUserRole(userId: string, role: SetUserRoleInput["role"]): Promise<ActionResult<null>> {
  const parsed = setUserRoleSchema.safeParse({ userId, role });
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");
  if (user.role !== "admin") return fail("not_authorized");

  // An admin can otherwise demote themselves out of the only admin account
  // with no one left to undo it -- cheap to block outright rather than build
  // a "last admin" count query for an edge case with no legitimate use.
  if (parsed.data.userId === user.id) {
    return fail("validation", "You cannot change your own role.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId);

  if (error) return fail("unknown", "Could not update that member's role.");

  revalidatePath("/admin");
  return ok(null);
}
