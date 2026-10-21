"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/dal/user";
import { listMyPhotos, type GalleryPhotoRow } from "@/lib/dal/galleries";
import {
  addGalleryPhotoSchema,
  albumIdSchema,
  albumSchema,
  photoIdSchema,
  reviewGalleryPhotoSchema,
  updateAlbumSchema,
  updateCaptionSchema,
  type AddGalleryPhotoInput,
  type AlbumInput,
  type ReviewGalleryPhotoInput,
  type UpdateAlbumInput,
  type UpdateCaptionInput,
} from "@/lib/validation/gallery";
import { fail, failFromRpc, failFromZod, ok, type ActionResult } from "@/lib/actions/result";
import { galleryRevalidationPaths } from "@/lib/gallery/revalidate";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateGallery(albumId: string, sessionId: string | null) {
  for (const { path, type } of galleryRevalidationPaths(albumId, sessionId)) {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  }
}

// Revalidation needs the album's linked session. Read it as the caller; if RLS
// hides the album the result is null, which just means no session-page paths.
async function sessionIdOfAlbum(supabase: Supabase, albumId: string): Promise<string | null> {
  const { data } = await supabase.from("galleries").select("session_id").eq("id", albumId).maybeSingle();
  return data?.session_id ?? null;
}

// The row is already gone by the time this runs, so a failure here must not
// turn a successful action into an error: the spec accepts an orphaned file.
// Removed as the signed-in user -- the Storage DELETE policy allows the
// uploader and reviewers.
async function removeFiles(supabase: Supabase, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from("gallery").remove(paths);
  if (error) console.error("[gallery] could not remove files", paths, error.message);
}

// Registration-style race safety lives in the RPC (eligibility, upload window
// and the pending cap are all enforced there), so this only validates shape
// and maps the JB codes.
export async function addGalleryPhoto(input: AddGalleryPhotoInput): Promise<ActionResult<{ id: string }>> {
  const parsed = addGalleryPhotoSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_gallery_photo", {
    p_gallery_id: parsed.data.galleryId,
    p_path: parsed.data.path,
    // The SQL function accepts NULL for "no caption", but the generated type
    // models the argument as a plain string; the cast only bridges that gap.
    p_caption: parsed.data.caption as string,
  });

  if (error) return failFromRpc(error);

  revalidateGallery(parsed.data.galleryId, await sessionIdOfAlbum(supabase, parsed.data.galleryId));
  return ok({ id: data.id });
}

export async function reviewGalleryPhoto(input: ReviewGalleryPhotoInput): Promise<ActionResult<null>> {
  const parsed = reviewGalleryPhotoSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Read the album id first: after a reject the row no longer exists.
  const { data: photo } = await supabase
    .from("gallery_photos")
    .select("gallery_id")
    .eq("id", parsed.data.photoId)
    .maybeSingle();

  const { data: removedPath, error } = await supabase.rpc("review_gallery_photo", {
    p_photo_id: parsed.data.photoId,
    p_action: parsed.data.action,
  });

  if (error) {
    // A concurrent approve/reject surfaces as JB008 (row already deleted by a
    // reject) or JB016 (already approved). To the user both mean "someone else
    // got there first", so collapse them into one outcome.
    if (error.code === "JB008" || error.code === "JB016") return fail("invalid_state");
    return failFromRpc(error);
  }

  if (parsed.data.action === "reject" && removedPath) {
    await removeFiles(supabase, [removedPath]);
  }

  if (photo) {
    revalidateGallery(photo.gallery_id, await sessionIdOfAlbum(supabase, photo.gallery_id));
  }
  return ok(null);
}

// gallery_photos DELETE policy lets reviewers delete any photo and the
// uploader delete their own while it is pending. Zero rows back means RLS
// refused (or it was already gone) -- reported as not_authorized.
export async function deleteGalleryPhoto(photoId: string): Promise<ActionResult<null>> {
  const parsed = photoIdSchema.safeParse({ photoId });
  if (!parsed.success) return fail("validation", "Invalid photo id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gallery_photos")
    .delete()
    .eq("id", parsed.data.photoId)
    .select("storage_path, gallery_id");

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not delete the photo.");
  }
  if (!data || data.length === 0) return fail("not_authorized");

  await removeFiles(supabase, data.map((row) => row.storage_path));
  revalidateGallery(data[0].gallery_id, await sessionIdOfAlbum(supabase, data[0].gallery_id));
  return ok(null);
}

export async function updatePhotoCaption(input: UpdateCaptionInput): Promise<ActionResult<null>> {
  const parsed = updateCaptionSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gallery_photos")
    .update({ caption: parsed.data.caption })
    .eq("id", parsed.data.photoId)
    .select("gallery_id");

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the caption.");
  }
  if (!data || data.length === 0) return fail("not_authorized");

  revalidateGallery(data[0].gallery_id, await sessionIdOfAlbum(supabase, data[0].gallery_id));
  return ok(null);
}

// Admin-only, enforced by the galleries insert policy (session albums are made
// by a trigger, so this only ever creates standalone albums).
export async function createAlbum(input: AlbumInput): Promise<ActionResult<{ id: string }>> {
  const parsed = albumSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("galleries")
    .insert({ title: parsed.data.title, description: parsed.data.description, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not create the album.");
  }

  revalidateGallery(data.id, null);
  revalidatePath("/admin");
  return ok({ id: data.id });
}

export async function updateAlbum(input: UpdateAlbumInput): Promise<ActionResult<null>> {
  const parsed = updateAlbumSchema.safeParse(input);
  if (!parsed.success) return failFromZod(parsed.error);

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("galleries")
    .update({ title: parsed.data.title, description: parsed.data.description })
    .eq("id", parsed.data.id)
    .select("id, session_id");

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not update the album.");
  }
  if (!data || data.length === 0) return fail("not_authorized");

  revalidateGallery(data[0].id, data[0].session_id);
  revalidatePath("/admin");
  return ok(null);
}

export async function deleteAlbum(id: string): Promise<ActionResult<null>> {
  const parsed = albumIdSchema.safeParse({ id });
  if (!parsed.success) return fail("validation", "Invalid album id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  const supabase = await createClient();

  // Photo rows cascade with the album, so collect the file paths first; the
  // files are removed after the row delete, and failures there are logged.
  const { data: photos } = await supabase
    .from("gallery_photos")
    .select("storage_path")
    .eq("gallery_id", parsed.data.id);

  const { data, error } = await supabase
    .from("galleries")
    .delete()
    .eq("id", parsed.data.id)
    .select("id, session_id");

  if (error) {
    if (error.code === "42501") return fail("not_authorized");
    return fail("unknown", "Could not delete the album.");
  }
  if (!data || data.length === 0) return fail("not_authorized");

  await removeFiles(supabase, (photos ?? []).map((row) => row.storage_path));
  revalidateGallery(data[0].id, data[0].session_id);
  revalidatePath("/admin");
  return ok(null);
}

// Read-only wrapper so a client component (Task 13) can refresh the caller's
// own photos without a route handler.
export async function listMyPhotosAction(galleryId: string): Promise<ActionResult<GalleryPhotoRow[]>> {
  const parsed = albumIdSchema.safeParse({ id: galleryId });
  if (!parsed.success) return fail("validation", "Invalid album id.");

  const user = await getCurrentUser();
  if (!user) return fail("not_authenticated");

  return ok(await listMyPhotos(parsed.data.id));
}
