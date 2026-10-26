"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import {
  setGuestAttributesSchema,
  setMemberGenderSchema,
  setMemberLevelSchema,
  type SetGuestAttributesInput,
  type SetMemberGenderInput,
  type SetMemberLevelInput,
} from "@/lib/validation/player-attributes";
import type { TablesInsert } from "@/types/supabase";

// These inputs carry no session id (a member's level/gender is not scoped to
// one session), so refresh every manage page via the route pattern.
function revalidateManage() {
  revalidatePath("/sessions/[id]/manage", "page");
}

// member_levels is host/admin-only by RLS. set_by comes from the
// authenticated session, never from client input.
export async function setMemberLevel(input: SetMemberLevelInput): Promise<ActionResult<null>> {
  const parsed = setMemberLevelSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.from("member_levels").upsert(
    {
      user_id: parsed.data.userId,
      level: parsed.data.level,
      set_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return fail("unknown", "Could not update level.");

  revalidateManage();
  return ok(null);
}

// Goes through host_set_member_gender: profiles_private.gender is not
// directly writable by a host, and the RPC enforces the consent gate.
export async function setMemberGender(input: SetMemberGenderInput): Promise<ActionResult<null>> {
  const parsed = setMemberGenderSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { error } = await supabase.rpc("host_set_member_gender", {
    p_user_id: parsed.data.userId,
    p_gender: parsed.data.gender,
  });

  if (error) return failFromRpc(error);

  revalidateManage();
  return ok(null);
}

export async function setGuestAttributes(
  input: SetGuestAttributesInput,
): Promise<ActionResult<null>> {
  const parsed = setGuestAttributesSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  // Only keys the caller provided go into the payload, so an upsert that sets
  // one field never wipes the other. level: null is provided and clears it.
  const payload: TablesInsert<"guest_attributes"> = {
    participant_id: parsed.data.participantId,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.gender !== undefined) payload.gender = parsed.data.gender;
  if (parsed.data.level !== undefined) payload.level = parsed.data.level;

  const supabase = await createClient();
  const { error } = await supabase
    .from("guest_attributes")
    .upsert(payload, { onConflict: "participant_id" });

  if (error) return fail("unknown", "Could not update guest details.");

  revalidateManage();
  return ok(null);
}
