import type { AppErrorCode } from "@/lib/errors/rpc";
import { ImageEncodeError, MAX_BYTES, type EncodedPhoto, type PhotoExt } from "@/lib/gallery/image";

// One file's resize -> Storage upload -> addGalleryPhoto, with the browser and
// server pieces injected so the failure handling is unit-testable. It never
// rejects: every throw becomes an outcome, so a row can never be stuck in a
// working state (runWithConcurrency swallows throws by design). No error text
// is surfaced: a failed save carries the Server Action's `code`, which the
// panel maps to a message in the viewer's locale.

export type UploadStage = "resizing" | "uploading" | "saving";

export type UploadOutcome =
  | { ok: true; path: string }
  | {
      ok: false;
      // read/encode/size: this file cannot be processed here, retrying won't
      // help. size: still over MAX_BYTES after the resize.
      // upload: nothing was stored, a retry starts over.
      // save: the file is stored at `path`, a retry re-saves that same path.
      reason: "read" | "encode" | "size" | "upload" | "save";
      path: string | null;
      code: AppErrorCode | null;
    };

export type UploadPipelineDeps = {
  // Set when a previous attempt already stored the file: skip straight to save.
  existingPath: string | null;
  resize: () => Promise<EncodedPhoto>;
  // The extension follows the encoded type (webp, or the jpeg fallback).
  makePath: (ext: PhotoExt) => string;
  upload: (path: string, blob: Blob) => Promise<{ error: unknown }>;
  save: (path: string) => Promise<{ ok: true } | { ok: false; code: AppErrorCode }>;
  onStage?: (stage: UploadStage) => void;
  onUploaded?: (path: string) => void;
};

export async function runUploadPipeline(deps: UploadPipelineDeps): Promise<UploadOutcome> {
  let path = deps.existingPath;
  let step: "resize" | "upload" | "save" = path ? "save" : "resize";

  try {
    if (!path) {
      deps.onStage?.("resizing");
      let encoded: EncodedPhoto;
      try {
        encoded = await deps.resize();
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof ImageEncodeError ? "encode" : "read",
          path: null,
          code: null,
        };
      }
      const { blob, ext } = encoded;
      // The original may be far over MAX_BYTES (validatePickedFile only
      // guards MAX_ORIGINAL_BYTES); the stored file must not be.
      if (blob.size > MAX_BYTES) return { ok: false, reason: "size", path: null, code: null };

      step = "upload";
      deps.onStage?.("uploading");
      const candidate = deps.makePath(ext);
      const { error } = await deps.upload(candidate, blob);
      if (error) return { ok: false, reason: "upload", path: null, code: null };
      path = candidate;
      step = "save";
      deps.onUploaded?.(path);
    }

    deps.onStage?.("saving");
    const result = await deps.save(path);
    if (!result.ok) return { ok: false, reason: "save", path, code: result.code };
    return { ok: true, path };
  } catch {
    if (step === "save" && path) return { ok: false, reason: "save", path, code: null };
    return { ok: false, reason: step === "resize" ? "read" : "upload", path: null, code: null };
  }
}
