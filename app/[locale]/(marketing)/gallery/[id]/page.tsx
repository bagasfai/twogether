import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getPublicAlbum, galleryPhotoUrl } from "@/lib/dal/galleries";
import { PageHero } from "@/components/marketing/page-hero";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import { formatAlbumDate } from "@/components/gallery/shared";

export const revalidate = 60;

// Required for ISR on a dynamic segment (see sessions/[id]/page.tsx): no ids
// are known at build time, each album is built on first request and cached.
export async function generateStaticParams() {
  return [];
}

// A malformed id would make Postgres raise invalid_text_representation (a
// 500); treat it as the missing album it is.
async function loadAlbum(id: string) {
  return z.uuid().safeParse(id).success ? getPublicAlbum(id) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/gallery/[id]">): Promise<Metadata> {
  const { id } = await params;
  const [album, t] = await Promise.all([loadAlbum(id), getTranslations("gallery")]);
  if (!album) return { title: t("albumNotFound") };

  const description = album.description ?? t("metaDescription");
  const cover = album.photos[0];

  return {
    title: t("albumMetaTitle", { album: album.title }),
    description,
    // album links get pasted into WhatsApp, so the preview matters
    openGraph: {
      title: album.title,
      description,
      type: "website",
      ...(cover ? { images: [galleryPhotoUrl(cover.storagePath)] } : {}),
    },
  };
}

export default async function GalleryAlbumPage({ params }: PageProps<"/[locale]/gallery/[id]">) {
  const { id } = await params;
  const [album, t, locale] = await Promise.all([
    loadAlbum(id),
    getTranslations("gallery"),
    getLocale(),
  ]);
  // 404 only when the album does not exist; an album with no approved
  // photos yet still renders, with an empty state.
  if (!album) notFound();

  const date = album.sessionStartsAt ? formatAlbumDate(album.sessionStartsAt, locale) : null;
  const meta = [date, album.location].filter(Boolean).join(" · ");

  return (
    <>
      <PageHero
        title={album.title}
        subtitle={
          meta ? <span className="font-display text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">{meta}</span> : null
        }
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
        <Link
          href="/gallery"
          className="inline-flex min-h-11 w-fit items-center gap-1 whitespace-nowrap rounded-full bg-sky-pale px-4 text-sm font-semibold text-navy outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t("back")}
        </Link>
        {album.description ? (
          <p className="max-w-[65ch] whitespace-pre-wrap text-base [overflow-wrap:anywhere]">{album.description}</p>
        ) : null}

        {album.photos.length === 0 ? (
          <div className="flex flex-col gap-1 rounded-2xl border-2 border-dashed border-input p-6">
            <p className="font-display text-xl font-bold">{t("noPhotos")}</p>
            <p className="text-sm text-muted-foreground">{t("noPhotosBody")}</p>
          </div>
        ) : (
          <PhotoGrid albumTitle={album.title} photos={album.photos} />
        )}
      </div>
    </>
  );
}
