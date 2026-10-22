"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HoldToConfirmButton } from "@/components/gallery/hold-to-confirm-button";
import { ReviewQueue } from "@/components/gallery/review-queue";
import { UploadPanel } from "@/components/gallery/upload-panel";
import { deleteGalleryPhoto, updateAlbum, updatePhotoCaption } from "@/lib/actions/galleries";
import { galleryPhotoUrl } from "@/lib/gallery/url";
// Type-only: erased at compile time, so the server-only DAL never reaches the
// client bundle.
import type { GalleryPhotoRow } from "@/lib/dal/galleries";

export type PhotosPanelAlbum = { id: string; title: string; description: string | null };

// Manage-page Photos tab. A session gets its album when it starts (trigger
// on start_session), so before that there is nothing to manage.
export function PhotosPanel({
  album,
  pending,
  approved,
}: {
  album: PhotosPanelAlbum | null;
  pending: GalleryPhotoRow[];
  approved: GalleryPhotoRow[];
}) {
  if (!album) {
    return <p className="text-sm text-muted-foreground">Photos open once the session starts.</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm font-medium">Photos</h2>
      <div className="flex min-w-0 flex-col gap-8">
        <ReviewQueue photos={pending} />
        <ApprovedPhotos photos={approved} />
        <AlbumDescription album={album} />
        <UploadPanel galleryId={album.id} />
      </div>
    </div>
  );
}

function ApprovedPhotos({ photos }: { photos: GalleryPhotoRow[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());

  const remove = async (photoId: string) => {
    try {
      const result = await deleteGalleryPhoto(photoId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setGone((current) => new Set(current).add(photoId));
      router.refresh();
    } catch {
      toast.error("Could not delete the photo.");
    }
  };

  const visible = photos.filter((photo) => !gone.has(photo.id));

  return (
    <section aria-labelledby="approved-photos-title" className="flex min-w-0 flex-col gap-3">
      <h3 id="approved-photos-title" className="text-sm font-medium text-muted-foreground">
        In the album <span className="font-mono tabular-nums">({visible.length})</span>
      </h3>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No approved photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((photo) => (
            <li key={photo.id} className="flex min-w-0 flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <Image
                  src={galleryPhotoUrl(photo.storagePath)}
                  alt={photo.caption || `Photo from ${photo.uploaderName ?? "an unknown member"}`}
                  fill
                  sizes="(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                />
              </div>
              <CaptionField photoId={photo.id} caption={photo.caption} />
              <HoldToConfirmButton label="Delete" className="h-11" onConfirm={() => remove(photo.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Saves on blur or Enter when the text changed; Escape restores the saved
// value. The schema trims and turns "" into null, so clearing the field
// removes the caption.
function CaptionField({ photoId, caption }: { photoId: string; caption: string | null }) {
  const [saved, setSaved] = useState(caption ?? "");
  const [value, setValue] = useState(caption ?? "");
  const [pending, startTransition] = useTransition();

  const save = () => {
    const next = value.trim();
    if (next === saved) {
      setValue(saved);
      return;
    }
    startTransition(async () => {
      try {
        const result = await updatePhotoCaption({ photoId, caption: next });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setSaved(next);
        setValue(next);
        toast.success("Caption saved.");
      } catch {
        toast.error("Could not update the caption.");
      }
    });
  };

  return (
    <Input
      aria-label="Caption"
      placeholder="Caption"
      value={value}
      maxLength={200}
      disabled={pending}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setValue(saved);
        }
      }}
      className="h-11"
    />
  );
}

function AlbumDescription({ album }: { album: PhotosPanelAlbum }) {
  const router = useRouter();
  const [saved, setSaved] = useState(album.description ?? "");
  const [value, setValue] = useState(album.description ?? "");
  const [pending, startTransition] = useTransition();

  const onSave = () =>
    startTransition(async () => {
      try {
        // updateAlbum writes title and description together, so the current
        // title goes along unchanged.
        const result = await updateAlbum({ id: album.id, title: album.title, description: value });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setSaved(value.trim());
        setValue(value.trim());
        toast.success("Description saved.");
        router.refresh();
      } catch {
        toast.error("Could not update the album.");
      }
    });

  return (
    <section aria-labelledby="album-description-title" className="flex min-w-0 flex-col gap-3">
      <h3 id="album-description-title" className="text-sm font-medium text-muted-foreground">
        Album description
      </h3>
      <Textarea
        aria-labelledby="album-description-title"
        placeholder="A line or two about the session, shown on the public album page."
        value={value}
        maxLength={1000}
        rows={3}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex justify-end">
        <Button className="h-11 px-5" disabled={pending || value.trim() === saved} onClick={onSave}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
