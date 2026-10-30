import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

export type SitemapSession = { id: string; updatedAt: string };
export type SitemapAlbum = { id: string; lastModified: string | null };

// PostgREST max_rows (1000) caps this list; the sitemap protocol allows 50 000
// URLs. A community this size is far below either, so there is no pagination --
// revisit if sessions approach the cap or they will silently truncate.
// RLS already limits anon to scheduled/live/completed; the explicit filter
// keeps the intent readable and stays correct for a signed-in reviewer.
export async function listSitemapSessions(): Promise<SitemapSession[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, updated_at")
    .in("status", ["scheduled", "live", "completed"]);

  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, updatedAt: s.updated_at }));
}

// Same rule as listPublicAlbums: an album with no approved photo shows an empty
// state, so it is not advertised. Same max_rows (1000) cap as above.
export async function listSitemapAlbums(): Promise<SitemapAlbum[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("galleries")
    .select("id, gallery_photos(created_at, status)")
    .eq("gallery_photos.status", "approved");

  if (error) throw error;

  return (data ?? [])
    .map((album) => {
      const photos = album.gallery_photos ?? [];
      const newest = photos.map((p) => p.created_at).sort().at(-1) ?? null;
      return { id: album.id, photoCount: photos.length, lastModified: newest };
    })
    .filter((album) => album.photoCount > 0)
    .map(({ id, lastModified }) => ({ id, lastModified }));
}
