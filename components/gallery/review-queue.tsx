"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HoldToConfirmButton } from "@/components/gallery/hold-to-confirm-button";
import { formatPhotoTime } from "@/components/gallery/shared";
import { reviewGalleryPhoto } from "@/lib/actions/galleries";
import { galleryPhotoUrl } from "@/lib/gallery/url";
// Type-only: erased at compile time, so the server-only DAL never reaches the
// client bundle.
import type { GalleryPhotoRow } from "@/lib/dal/galleries";

// Pending photos for one album. Approve is optimistic: the row leaves the
// list at once and comes back (with a toast) only if the action fails.
// Reject is a hard delete of the row and the file, so it sits behind a hold
// and is not optimistic. When another reviewer got there first the action
// returns invalid_state (JB008/JB016): the row stays gone, the message is
// shown, and the page is refreshed so the lists match the database.
export function ReviewQueue({
  photos,
  albumTitles,
}: {
  photos: GalleryPhotoRow[];
  // Optional: when set (cross-album admin queue), each row shows its album.
  albumTitles?: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());

  const hide = (id: string) => setGone((current) => new Set(current).add(id));
  const unhide = (id: string) =>
    setGone((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  const review = async (photoId: string, action: "approve" | "reject") => {
    if (action === "approve") hide(photoId);
    try {
      const result = await reviewGalleryPhoto({ photoId, action });
      if (result.ok) {
        hide(photoId);
        router.refresh();
        return;
      }
      toast.error(result.message);
      if (result.code === "invalid_state") {
        hide(photoId);
        router.refresh();
        return;
      }
      if (action === "approve") unhide(photoId);
    } catch {
      toast.error(action === "approve" ? "Could not approve the photo." : "Could not reject the photo.");
      if (action === "approve") unhide(photoId);
    }
  };

  const visible = photos.filter((photo) => !gone.has(photo.id));

  return (
    <section aria-labelledby="review-queue-title" className="flex min-w-0 flex-col gap-3">
      <h3 id="review-queue-title" className="text-sm font-medium text-muted-foreground">
        Waiting for review <span className="font-mono tabular-nums">({visible.length})</span>
      </h3>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to review.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {visible.map((photo) => (
            <li key={photo.id} className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Image
                    src={galleryPhotoUrl(photo.storagePath)}
                    alt={photo.caption || `Photo from ${photo.uploaderName ?? "an unknown member"}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{photo.uploaderName ?? "Unknown"}</span>
                  {albumTitles?.[photo.galleryId] ? (
                    <span className="truncate text-xs text-muted-foreground">
                      in {albumTitles[photo.galleryId]}
                    </span>
                  ) : null}
                  <time dateTime={photo.createdAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatPhotoTime(photo.createdAt)}
                  </time>
                  {photo.caption ? (
                    <span className="truncate text-xs text-muted-foreground">{photo.caption}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <Button className="h-11 px-5" onClick={() => void review(photo.id, "approve")}>
                  Approve
                </Button>
                <HoldToConfirmButton
                  label="Reject"
                  className="h-11"
                  onConfirm={() => review(photo.id, "reject")}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
