"use client";

import { useRef } from "react";
import Image from "next/image";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { galleryPhotoUrl } from "@/lib/gallery/url";
import type { PublicAlbumDetail } from "@/lib/dal/galleries";

type Photo = PublicAlbumDetail["photos"][number];

// Light-on-ink controls: 44px targets, no coral fill (coral is the focus ring
// only), focus ring appears instantly.
const CONTROL_CLASS =
  "size-11 text-background hover:bg-background/15 hover:text-background focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-5";

export function Lightbox({
  photos,
  albumTitle,
  index,
  onIndexChange,
  onClose,
}: {
  photos: Photo[];
  albumTitle: string;
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("gallery");
  // Opened without a DialogTrigger, so Radix has nothing to return focus to
  // on close; remember the thumbnail that opened it and restore that.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const total = photos.length;
  const photo = index !== null ? photos[index] : undefined;
  const open = photo !== undefined;

  // Wraps at both ends so the prev/next buttons are never disabled, which
  // would drop focus out of the dialog when the last step is taken.
  const go = (delta: number) => {
    if (index === null || total === 0) return;
    onIndexChange((index + delta + total) % total);
  };

  const nextPhoto = index !== null && total > 1 ? photos[(index + 1) % total] : undefined;
  const altFor = (p: Photo) => p.caption || t("defaultAlt", { album: albumTitle });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPortal>
        {/* Ink scrim. Opacity-only fade for everyone; reduced motion shortens it to --dur-micro. */}
        <DialogOverlay className="bg-foreground/95 duration-[var(--dur-short)] motion-reduce:duration-[var(--dur-micro)]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              go(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              go(1);
            }
          }}
          className="fixed inset-0 z-50 flex flex-col gap-2 p-2 outline-none duration-[var(--dur-short)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:duration-[var(--dur-micro)] sm:p-4"
        >
          <DialogTitle className="sr-only">{albumTitle}</DialogTitle>

          <div className="flex justify-end">
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className={CONTROL_CLASS} aria-label={t("close")}>
                <XIcon />
              </Button>
            </DialogClose>
          </div>

          {photo ? (
            <>
              <div className="relative min-h-0 flex-1">
                <Image
                  key={photo.id}
                  src={galleryPhotoUrl(photo.storagePath)}
                  alt={altFor(photo)}
                  fill
                  sizes="100vw"
                  loading="eager"
                  className="object-contain"
                />
                {nextPhoto ? (
                  // Next image warmed with the same sizes so the browser picks
                  // the same srcset candidate the visible image will use.
                  <div aria-hidden className="pointer-events-none invisible absolute inset-0">
                    <Image
                      src={galleryPhotoUrl(nextPhoto.storagePath)}
                      alt=""
                      fill
                      sizes="100vw"
                      loading="eager"
                      className="object-contain"
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col items-center gap-1 pb-2">
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={CONTROL_CLASS}
                    aria-label={t("previous")}
                    onClick={() => go(-1)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <span
                    aria-live="polite"
                    className="min-w-[7ch] text-center font-mono text-sm tabular-nums text-background/80"
                  >
                    {t("position", { current: (index ?? 0) + 1, total })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={CONTROL_CLASS}
                    aria-label={t("next")}
                    onClick={() => go(1)}
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
                {photo.caption ? (
                  <p className="max-w-[65ch] px-2 text-center text-sm text-background [overflow-wrap:anywhere]">
                    {photo.caption}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
