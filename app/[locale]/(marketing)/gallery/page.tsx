import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPublicInventory, listPublicAlbums } from "@/lib/dal/galleries";
import { AlbumCard } from "@/components/gallery/album-card";
import { GALLERY_EAGER_COUNT, GALLERY_GRID_CLASS } from "@/components/gallery/shared";

// ISR, same as the sessions pages. Reads only through the cookieless public
// client; gallery actions revalidate this path on approve/delete.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("gallery");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function GalleryPage() {
  const [albums, inventory, t] = await Promise.all([
    listPublicAlbums(),
    getPublicInventory(),
    getTranslations("gallery"),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        {/* --text-xl, display weight */}
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-balance">
          {t("tagline")}
        </h1>
        {albums.length > 0 ? (
          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {t("inventory", { albums: inventory.albums, photos: inventory.photos })}
          </p>
        ) : null}
      </header>

      {albums.length === 0 ? (
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className={GALLERY_GRID_CLASS}>
          {albums.map((album, i) => (
            <li key={album.id} className="min-w-0">
              <AlbumCard album={album} eager={i < GALLERY_EAGER_COUNT} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
