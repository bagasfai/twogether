import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentUser } from "@/lib/dal/user";
import type { Database } from "@/types/supabase";

// Pure URL builder lives in lib/gallery/url.ts so client components can use it
// without importing this server-only module; re-exported for server callers.
export { galleryPhotoUrl } from "@/lib/gallery/url";

export type PhotoStatus = Database["public"]["Enums"]["gallery_photo_status"];

export type PublicAlbum = {
  id: string;
  title: string;
  sessionStartsAt: string | null;
  photoCount: number;
  coverPath: string | null;
};

export type PublicAlbumDetail = {
  id: string;
  title: string;
  description: string | null;
  sessionStartsAt: string | null;
  location: string | null;
  photos: { id: string; storagePath: string; caption: string | null }[];
};

export type GalleryPhotoRow = {
  id: string;
  galleryId: string;
  storagePath: string;
  caption: string | null;
  status: PhotoStatus;
  uploaderName: string | null;
  createdAt: string;
};

export type AdminAlbum = {
  id: string;
  title: string;
  description: string | null;
  sessionId: string | null;
  photoCount: number;
  pendingCount: number;
};

type PhotoOrderFields = { sort_order: number; created_at: string };

function byDisplayOrder(a: PhotoOrderFields, b: PhotoOrderFields): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

// PostgREST max_rows (1000 in config.toml) caps top-level rows only, not rows
// embedded under each album, so photoCount/cover are not truncated by it; the
// top-level galleries list is far below that cap for a community this size.
// Anon-safe. The explicit status filter on the embedded photos is belt and
// braces: gallery_photos RLS already limits anon to approved rows, but this
// keeps the result correct if the caller were ever signed in as a reviewer.
// The linked session is embedded; anon can only read scheduled/live/completed
// sessions, so a draft session's album simply gets a null start time.
export async function listPublicAlbums(): Promise<PublicAlbum[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("galleries")
    .select(
      "id, title, created_at, sessions(starts_at), gallery_photos(storage_path, sort_order, created_at, status)",
    )
    .eq("gallery_photos.status", "approved");

  if (error) throw error;

  return (data ?? [])
    .map((album) => {
      const photos = [...(album.gallery_photos ?? [])].sort(byDisplayOrder);
      return {
        id: album.id,
        title: album.title,
        createdAt: album.created_at,
        sessionStartsAt: album.sessions?.starts_at ?? null,
        photoCount: photos.length,
        coverPath: photos[0]?.storage_path ?? null,
      };
    })
    .filter((album) => album.photoCount > 0)
    // Deterministic: session-linked albums first by session start (newest
    // first), then standalone albums by creation time (newest first).
    .sort((a, b) => {
      if (a.sessionStartsAt && b.sessionStartsAt) return b.sessionStartsAt.localeCompare(a.sessionStartsAt);
      if (a.sessionStartsAt) return -1;
      if (b.sessionStartsAt) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map(({ createdAt: _createdAt, ...album }) => {
      void _createdAt;
      return album;
    });
}

// Returns the album even when it has no approved photos (the page shows an
// empty state); null only when it does not exist.
export async function getPublicAlbum(id: string): Promise<PublicAlbumDetail | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("galleries")
    .select(
      "id, title, description, sessions(starts_at, location), gallery_photos(id, storage_path, caption, sort_order, created_at, status)",
    )
    .eq("id", id)
    .eq("gallery_photos.status", "approved")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    sessionStartsAt: data.sessions?.starts_at ?? null,
    location: data.sessions?.location ?? null,
    photos: [...(data.gallery_photos ?? [])].sort(byDisplayOrder).map((photo) => ({
      id: photo.id,
      storagePath: photo.storage_path,
      caption: photo.caption,
    })),
  };
}

export async function getAlbumForSession(sessionId: string): Promise<{ id: string } | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("galleries")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return data ? { id: data.id } : null;
}

// Counts are computed server-side (head + exact count) so the max_rows cap
// on returned rows can never make the inventory undercount photos. Albums
// counts those with >=1 approved photo, same rule as listPublicAlbums.
export async function getPublicInventory(): Promise<{ albums: number; photos: number }> {
  const supabase = createPublicClient();

  const { count, error } = await supabase
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  if (error) throw error;

  const albums = await listPublicAlbums();
  return { albums: albums.length, photos: count ?? 0 };
}

const PHOTO_COLUMNS =
  "id, gallery_id, storage_path, caption, status, created_at, uploader:profiles!gallery_photos_uploaded_by_fkey(full_name)";

type PhotoQueryRow = {
  id: string;
  gallery_id: string;
  storage_path: string;
  caption: string | null;
  status: PhotoStatus;
  created_at: string;
  uploader: { full_name: string | null } | null;
};

function toPhotoRow(row: PhotoQueryRow): GalleryPhotoRow {
  return {
    id: row.id,
    galleryId: row.gallery_id,
    storagePath: row.storage_path,
    caption: row.caption,
    status: row.status,
    uploaderName: row.uploader?.full_name ?? null,
    createdAt: row.created_at,
  };
}

// RLS decides who sees pending rows (reviewers all, uploaders their own), so
// these only need the "logged in" short-circuit, same convention as the other
// authenticated DAL reads.
export async function listPendingPhotos(galleryId: string): Promise<GalleryPhotoRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gallery_photos")
    .select(PHOTO_COLUMNS)
    .eq("gallery_id", galleryId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as PhotoQueryRow[]).map(toPhotoRow);
}

// The caller's own photos in this album (any status). Filtered by
// uploaded_by explicitly because a reviewer's RLS view includes everyone's.
export async function listMyPhotos(galleryId: string): Promise<GalleryPhotoRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gallery_photos")
    .select(PHOTO_COLUMNS)
    .eq("gallery_id", galleryId)
    .eq("uploaded_by", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as PhotoQueryRow[]).map(toPhotoRow);
}

// Like listCommunityAnnouncementsForAdmin, this only checks "logged in"; the
// admin page gates with requireAdmin and RLS bounds what a reviewer can see.
export async function listAllPendingForAdmin(): Promise<GalleryPhotoRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gallery_photos")
    .select(PHOTO_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as PhotoQueryRow[]).map(toPhotoRow);
}

export async function listAdminAlbums(): Promise<AdminAlbum[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("galleries")
    .select("id, title, description, session_id, gallery_photos(status)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((album) => {
    const photos = album.gallery_photos ?? [];
    return {
      id: album.id,
      title: album.title,
      description: album.description,
      sessionId: album.session_id,
      photoCount: photos.filter((p) => p.status === "approved").length,
      pendingCount: photos.filter((p) => p.status === "pending").length,
    };
  });
}

// For the manage-page Photos tab. RLS limits galleries to ones the caller may
// see; a non-host simply gets the public album row, and the tab itself is
// only rendered for hosts.
export async function getHostAlbum(
  sessionId: string,
): Promise<{ id: string; description: string | null } | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("galleries")
    .select("id, description")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return data ? { id: data.id, description: data.description } : null;
}
