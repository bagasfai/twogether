"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import {
  announcementSchema,
  createAnnouncementSchema,
  announcementIdSchema,
  type AnnouncementInput,
} from "@/lib/validation/announcement";
import { fail, failFromZod, ok, type ActionResult } from "@/lib/actions/result";

// Mirrors updateSession's existing revalidatePath strings
// (lib/actions/sessions.ts) rather than inventing a new convention.
function revalidateForSession(sessionId: string | null) {
  if (sessionId === null) {
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/admin");
    return;
  }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/manage`);
  revalidatePath("/dashboard");
}

export async function createAnnouncement(
  input: AnnouncementInput & { sessionId: string | null },
): Promise<ActionResult<{ id: string }>> {
  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      session_id: parsed.data.sessionId,
      title: parsed.data.title,
      body: parsed.data.body,
      created_by: user.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // 42501 is an RLS refusal -- announcements_write requires is_admin() for
    // a community-wide row (sessionId null) or is_session_host(sessionId)
    // otherwise. The UI never offers this form to a caller who fails that
    // check, so this is defense-in-depth, not a reachable UI state.
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not post the announcement.");
  }

  revalidateForSession(parsed.data.sessionId);
  return ok({ id: data.id });
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
): Promise<ActionResult<null>> {
  const idParsed = announcementIdSchema.safeParse({ id });
  if (!idParsed.success) return fail("validation", "Invalid announcement id.");

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .update({ title: parsed.data.title, body: parsed.data.body })
    .eq("id", idParsed.data.id)
    .select("session_id")
    .single();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the announcement.");
  }

  revalidateForSession(data.session_id);
  return ok(null);
}
