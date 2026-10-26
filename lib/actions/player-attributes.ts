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
import type { TablesUpdate } from "@/types/supabase";

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
    },
    { onConflict: "user_id" },
  );

  if (error) return fail("unknown", "Could not update level.");

  revalidateManage();
  return ok(null);
}

// Goes through host_set_member_gender: profiles_private.gender is not
// directly writable by a host. The RPC is write-only: it lets any host/admin
// set any user's gender, with no consent or session check. The consent gate
// only limits what hosts can READ from profiles_private.
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

  // Only keys the caller provided go into the payload, so a write that sets
  // one field never wipes the other. level: null is provided and clears it.
  const changes: TablesUpdate<"guest_attributes"> = {};
  if (parsed.data.gender !== undefined) changes.gender = parsed.data.gender;
  if (parsed.data.level !== undefined) changes.level = parsed.data.level;

  // Nothing provided: an empty UPDATE body is invalid, and there is nothing to write.
  if (Object.keys(changes).length === 0) return ok(null);

  const participantId = parsed.data.participantId;
  const supabase = await createClient();

  // Not an upsert: PostgREST puts every payload column (participant_id too)
  // in ON CONFLICT DO UPDATE SET, and participant_id is deliberately outside
  // the column UPDATE grant, so an upsert is denied with 42501. Update first
  // (RLS limits it to hosts), insert only if no row matched.
  const update = () =>
    supabase
      .from("guest_attributes")
      .update(changes)
      .eq("participant_id", participantId)
      .select("participant_id");

  let { data, error } = await update();
  if (!error && (data ?? []).length === 0) {
    const insert = await supabase
      .from("guest_attributes")
      .insert({ participant_id: participantId, ...changes });
    error = insert.error;
    // Lost a race with another insert: the row exists now, so update it.
    if (error?.code === "23505") {
      ({ error } = await update());
    }
  }

  if (error) return fail("unknown", "Could not update guest details.");

  revalidateManage();
  return ok(null);
}
