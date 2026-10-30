import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPublicInventory, listPublicAlbums } from "@/lib/dal/galleries";
import { PageHero } from "@/components/marketing/page-hero";
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
    <>
      <PageHero
        title={t("tagline")}
        subtitle={
          albums.length > 0 ? (
            <span className="font-display text-xl font-semibold tabular-nums">
              {t("inventory", { albums: inventory.albums, photos: inventory.photos })}
            </span>
          ) : null
        }
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        {albums.length === 0 ? (
          <p className="mx-auto w-full max-w-[65ch] rounded-2xl border-2 border-dashed border-input p-6 text-center text-base text-muted-foreground">
            {t("empty")}
          </p>
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
    </>
  );
}
