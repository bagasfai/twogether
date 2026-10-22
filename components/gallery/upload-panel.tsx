"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { HoldToConfirmButton } from "@/components/gallery/hold-to-confirm-button";
import { createClient } from "@/lib/supabase/client";
import { addGalleryPhoto, deleteGalleryPhoto, listMyPhotosAction } from "@/lib/actions/galleries";
import { ACCEPTED_TYPES, galleryPhotoPath, resizeForUpload, validatePickedFile } from "@/lib/gallery/image";
import { runWithConcurrency } from "@/lib/gallery/upload-queue";
import { runUploadPipeline } from "@/lib/gallery/upload-pipeline";
import { galleryPhotoUrl } from "@/lib/gallery/url";
import { cn } from "@/lib/utils";
// Type-only: erased at compile time, so the server-only guard in the DAL never
// reaches the client bundle.
import type { GalleryPhotoRow } from "@/lib/dal/galleries";

const UPLOAD_CONCURRENCY = 3;

// The browser Supabase client cannot report byte progress for a Storage
// upload, so the bar moves by stage instead. Each value is a fraction of the
// bar; the stage label is what screen readers get.
const STAGE_PROGRESS = { queued: 0.05, resizing: 0.2, uploading: 0.55, saving: 0.85 } as const;

type Stage = keyof typeof STAGE_PROGRESS;

type FileRow = {
  id: string;
  name: string;
  file: File;
} & ({ state: "working"; stage: Stage } | { state: "invalid"; error: string } | { state: "failed"; error: string });

type Visibility = "checking" | "hidden" | "visible";

export function UploadPanel({ galleryId }: { galleryId: string }) {
  const t = useTranslations("gallery");
  const [supabase] = useState(createClient);
  const [visibility, setVisibility] = useState<Visibility>("checking");
  const [rows, setRows] = useState<FileRow[]>([]);
  const [photos, setPhotos] = useState<GalleryPhotoRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Paths whose Storage upload already succeeded, keyed by row id: a Retry for
  // those only re-runs addGalleryPhoto, with the same path, and never uploads
  // the file a second time.
  const uploadedPaths = useRef(new Map<string, string>());
  // Batches picked one after another run back to back, so the limit of 3 in
  // flight holds across batches too.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const refreshPhotos = useCallback(async () => {
    try {
      const result = await listMyPhotosAction(galleryId);
      if (result.ok) setPhotos(result.data);
    } catch {
      // A failed refresh leaves the previous list on screen; the next
      // successful upload or delete refreshes it again.
    }
  }, [galleryId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setVisibility("hidden");
        return;
      }
      // Advisory only: add_gallery_photo and the Storage policies re-check
      // eligibility on every upload.
      const { data } = await supabase.rpc("can_upload_to_gallery", { p_gallery_id: galleryId });
      if (cancelled) return;
      if (data !== true) {
        setVisibility("hidden");
        return;
      }
      setVisibility("visible");
      await refreshPhotos();
    })().catch(() => {
      if (!cancelled) setVisibility("hidden");
    });

    return () => {
      cancelled = true;
    };
  }, [galleryId, refreshPhotos, supabase]);

  const patchRow = useCallback((id: string, next: Partial<FileRow> & Pick<FileRow, "state">) => {
    setRows((current) => current.map((row) => (row.id === id ? ({ ...row, ...next } as FileRow) : row)));
  }, []);

  const removeRow = useCallback((id: string) => {
    uploadedPaths.current.delete(id);
    setRows((current) => current.filter((row) => row.id !== id));
  }, []);

  const processRow = useCallback(
    async ({ id, file }: { id: string; file: File }) => {
      // runUploadPipeline never rejects; the outer catch only guards the UI
      // updates around it, so a row can never be left in "working".
      try {
        const outcome = await runUploadPipeline({
          existingPath: uploadedPaths.current.get(id) ?? null,
          resize: () => resizeForUpload(file),
          makePath: (ext) => galleryPhotoPath(galleryId, crypto.randomUUID(), ext),
          // upsert: false because the bucket has no UPDATE policy, and a fresh
          // uuid path never needs overwriting. blob.type is webp or the jpeg
          // fallback, matching the path's extension.
          upload: (path, blob) =>
            supabase.storage.from("gallery").upload(path, blob, { contentType: blob.type, upsert: false }),
          // The schema's caption is a string that trims "" to null, so "no
          // caption" is sent as "".
          save: (path) => addGalleryPhoto({ galleryId, path, caption: "" }),
          onStage: (stage) => patchRow(id, { state: "working", stage }),
          onUploaded: (path) => uploadedPaths.current.set(id, path),
        });

        if (outcome.ok) {
          // Silent success: the row goes away and the photo shows up below.
          removeRow(id);
          await refreshPhotos();
          return;
        }

        switch (outcome.reason) {
          // Retrying the same file in the same browser cannot help: no Retry.
          case "read":
            patchRow(id, { state: "invalid", error: t("fileReadFailed") });
            return;
          case "encode":
            patchRow(id, { state: "invalid", error: t("fileEncodeFailed") });
            return;
          case "size":
            patchRow(id, { state: "invalid", error: t("fileTooLarge") });
            return;
          case "upload":
            patchRow(id, { state: "failed", error: t("fileUploadFailed") });
            return;
          case "save":
            patchRow(id, { state: "failed", error: outcome.message ?? t("fileSaveFailed") });
            return;
        }
      } catch {
        // The stored path (if any) stays in uploadedPaths, so Retry re-saves it.
        patchRow(id, {
          state: "failed",
          error: uploadedPaths.current.has(id) ? t("fileSaveFailed") : t("fileUploadFailed"),
        });
      }
    },
    [galleryId, patchRow, refreshPhotos, removeRow, supabase, t],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const picked: FileRow[] = files.map((file) => {
        const id = crypto.randomUUID();
        const check = validatePickedFile(file);
        if (check.ok) return { id, name: file.name, file, state: "working", stage: "queued" };
        const error =
                    check.reason === "type"
            ? t("fileInvalidType")
            : check.reason === "empty"
              ? t("fileEmpty")
              : t("fileOriginalTooLarge");
        return { id, name: file.name, file, state: "invalid", error };
      });

      setRows((current) => [...current, ...picked]);

      const accepted = picked.filter((row) => row.state === "working");
      queue.current = queue.current.then(() => runWithConcurrency(accepted, UPLOAD_CONCURRENCY, processRow));
    },
    [processRow, t],
  );

  // Retries join the same queue so they also respect the in-flight limit.
  const retryRow = (row: FileRow) => {
    patchRow(row.id, { state: "working", stage: "queued" });
    queue.current = queue.current.then(() => runWithConcurrency([row], UPLOAD_CONCURRENCY, processRow));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const removePhoto = async (photoId: string) => {
    let message: string | null;
    try {
      const result = await deleteGalleryPhoto(photoId);
      message = result.ok ? null : result.message;
    } catch {
      message = t("deleteFailed");
    }
    if (message) {
      toast.error(message);
      return;
    }
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    await refreshPhotos();
  };

  // Visitors and anyone not eligible get nothing, so the ISR page renders the
  // same static HTML for everyone and this island only adds to it.
  if (visibility !== "visible") return null;

  return (
    <section aria-labelledby="upload-panel-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="upload-panel-title" className="text-base font-semibold">
          {t("uploadTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("uploadHint")}</p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors duration-[var(--dur-micro)] ease-[var(--ease-out)] motion-reduce:transition-none",
          dragging ? "border-foreground bg-muted" : "border-border",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            // Reset so picking the same file again still fires change.
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 items-center justify-center rounded-full border border-foreground px-4 text-sm font-medium outline-none transition-colors duration-[var(--dur-micro)] ease-[var(--ease-out)] hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {t("choosePhotos")}
        </button>
        <p className="text-sm text-muted-foreground">{t("dropHint")}</p>
      </div>

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-mono text-sm" title={row.name}>
                  {row.name}
                </span>
                {row.state === "failed" ? (
                  <button
                    type="button"
                    onClick={() => retryRow(row)}
                    className="min-h-11 shrink-0 rounded-full px-2 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    {t("retry")}
                  </button>
                ) : null}
                {row.state !== "working" ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="min-h-11 shrink-0 rounded-full px-2 text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                    aria-label={t("dismissFile", { name: row.name })}
                  >
                    {t("dismiss")}
                  </button>
                ) : null}
              </div>
              {row.state === "working" ? (
                <div
                  role="progressbar"
                  aria-label={t("fileProgress", { name: row.name })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(STAGE_PROGRESS[row.stage] * 100)}
                  aria-valuetext={t(`stage.${row.stage}`)}
                  className="h-0.5 w-full overflow-hidden rounded-full bg-border"
                >
                  <div
                    className="h-full origin-left bg-foreground transition-transform duration-[var(--dur-long)] ease-[var(--ease-out)] motion-reduce:transition-none"
                    style={{ transform: `scaleX(${STAGE_PROGRESS[row.stage]})` }}
                  />
                </div>
              ) : (
                <p role="alert" className="text-sm text-destructive">
                  {row.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {photos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">{t("myPhotos")}</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id} className="flex min-w-0 flex-col gap-2">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={galleryPhotoUrl(photo.storagePath)}
                    alt={photo.caption || t("myPhotoAlt")}
                    fill
                    sizes="(min-width: 640px) 224px, 50vw"
                    className="object-cover"
                  />
                </div>
                {photo.status === "pending" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="warning">{t("pending")}</Badge>
                    {/* The uploader may delete only while pending (RLS), so
                        approved photos get no control here. */}
                    <HoldToConfirmButton
                      label={t("deletePhoto")}
                      onConfirm={() => removePhoto(photo.id)}
                      className="h-11"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
