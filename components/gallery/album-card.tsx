import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { galleryPhotoUrl } from "@/lib/gallery/url";
import { formatAlbumDate, GALLERY_GRID_SIZES } from "@/components/gallery/shared";
import type { PublicAlbum } from "@/lib/dal/galleries";

// `eager` is for the first row: those covers are above the fold and usually
// the LCP element, so they should not wait for lazy loading.
export function AlbumCard({ album, eager = false }: { album: PublicAlbum; eager?: boolean }) {
  const t = useTranslations("gallery");
  const locale = useLocale();
  const date = album.sessionStartsAt ? formatAlbumDate(album.sessionStartsAt, locale) : null;

  return (
    // Whole card is one link. Hover is a small lift plus a navy border; under
    // reduced motion the lift is dropped and nothing is transitioned.
    <Link
      href={`/gallery/${album.id}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-border bg-card shadow-[0_8px_24px_-14px_oklch(28%_0.13_264/0.4)] outline-none transition-[transform,border-color] duration-[var(--dur-short)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-navy focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[4/3] bg-muted">
        {album.coverPath ? (
          <Image
            src={galleryPhotoUrl(album.coverPath)}
            alt=""
            fill
            sizes={GALLERY_GRID_SIZES}
            loading={eager ? "eager" : "lazy"}
            className="object-cover"
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-3">
        {/* Single line so the clickable text never wraps; the full title is on the album page. */}
        <span className="truncate font-display text-xl font-bold leading-tight" title={album.title}>
          {album.title}
        </span>
        {/* --text-xs */}
        <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
          {date ? <span className="truncate">{date}</span> : null}
          <span className="truncate">{t("albumPhotoCount", { count: album.photoCount })}</span>
        </span>
      </div>
    </Link>
  );
}
