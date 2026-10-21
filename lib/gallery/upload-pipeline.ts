import { WebpUnsupportedError } from "@/lib/gallery/image";

// One file's resize -> Storage upload -> addGalleryPhoto, with the browser and
// server pieces injected so the failure handling is unit-testable. It never
// rejects: every throw becomes an outcome, so a row can never be stuck in a
// working state (runWithConcurrency swallows throws by design). Raw error text
// is never surfaced; only the Server Action's own user-facing `message` is.

export type UploadStage = "resizing" | "uploading" | "saving";

export type UploadOutcome =
  | { ok: true; path: string }
  | {
      ok: false;
      // read/encode: this file cannot be processed here, retrying won't help.
      // upload: nothing was stored, a retry starts over.
      // save: the file is stored at `path`, a retry re-saves that same path.
      reason: "read" | "encode" | "upload" | "save";
      path: string | null;
      message: string | null;
    };

export type UploadPipelineDeps = {
  // Set when a previous attempt already stored the file: skip straight to save.
  existingPath: string | null;
  resize: () => Promise<Blob>;
  makePath: () => string;
  upload: (path: string, blob: Blob) => Promise<{ error: unknown }>;
  save: (path: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onStage?: (stage: UploadStage) => void;
  onUploaded?: (path: string) => void;
};

export async function runUploadPipeline(deps: UploadPipelineDeps): Promise<UploadOutcome> {
  let path = deps.existingPath;
  let step: "resize" | "upload" | "save" = path ? "save" : "resize";

  try {
    if (!path) {
      deps.onStage?.("resizing");
      let blob: Blob;
      try {
        blob = await deps.resize();
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof WebpUnsupportedError ? "encode" : "read",
          path: null,
          message: null,
        };
      }

      step = "upload";
      deps.onStage?.("uploading");
      const candidate = deps.makePath();
      const { error } = await deps.upload(candidate, blob);
      if (error) return { ok: false, reason: "upload", path: null, message: null };
      path = candidate;
      step = "save";
      deps.onUploaded?.(path);
    }

    deps.onStage?.("saving");
    const result = await deps.save(path);
    if (!result.ok) return { ok: false, reason: "save", path, message: result.message };
    return { ok: true, path };
  } catch {
    if (step === "save" && path) return { ok: false, reason: "save", path, message: null };
    return { ok: false, reason: step === "resize" ? "read" : "upload", path: null, message: null };
  }
}
