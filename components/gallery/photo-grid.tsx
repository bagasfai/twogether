"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Lightbox } from "@/components/gallery/lightbox";
import { GALLERY_EAGER_COUNT, GALLERY_GRID_CLASS, GALLERY_GRID_SIZES } from "@/components/gallery/shared";
import { galleryPhotoUrl } from "@/lib/gallery/url";
import type { PublicAlbumDetail } from "@/lib/dal/galleries";

export function PhotoGrid({
  albumTitle,
  photos,
}: {
  albumTitle: string;
  photos: PublicAlbumDetail["photos"];
}) {
  const t = useTranslations("gallery");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <ul className={GALLERY_GRID_CLASS}>
        {photos.map((photo, i) => (
          <li key={photo.id} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={t("openPhoto", { current: i + 1, total: photos.length })}
              className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <Image
                src={galleryPhotoUrl(photo.storagePath)}
                alt={photo.caption || t("defaultAlt", { album: albumTitle })}
                fill
                sizes={GALLERY_GRID_SIZES}
                loading={i < GALLERY_EAGER_COUNT ? "eager" : "lazy"}
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox
        photos={photos}
        albumTitle={albumTitle}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
