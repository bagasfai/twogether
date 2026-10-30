// Shared by the server album card and the client photo grid, so it must stay
// free of server-only imports.

// Matches the grid on both gallery pages: 2 columns below md, 3 at md, 4 at
// lg, inside a max-w-5xl container (so a tile never exceeds ~256px once the
// container caps out). Slight overestimates to cover gaps and padding.
export const GALLERY_GRID_SIZES = "(min-width: 1024px) 256px, (min-width: 768px) 34vw, 50vw";

export const GALLERY_GRID_CLASS = "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4";

// Pinned to Asia/Jakarta like lib/format/whatsapp-share.ts: the community is
// Jakarta-based and these render on the server, whose zone is not.
export function formatAlbumDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(
    new Date(iso),
  );
}

// The first row at the widest layout (4 columns) is above the fold and holds
// the LCP image, so those load eagerly; the rest stay lazy.
export const GALLERY_EAGER_COUNT = 4;

// Upload time on the manage-page Photos tab. Fixed locale and zone so the
// server render and the client hydration produce the same string.
export function formatPhotoTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}
