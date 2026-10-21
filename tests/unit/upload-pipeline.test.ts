import { describe, expect, it, vi } from "vitest";
import { runUploadPipeline, type UploadPipelineDeps } from "@/lib/gallery/upload-pipeline";
import { WebpUnsupportedError } from "@/lib/gallery/image";

const PATH = "g/p.webp";
const blob = new Blob(["x"], { type: "image/webp" });

function deps(overrides: Partial<UploadPipelineDeps> = {}): UploadPipelineDeps {
  return {
    existingPath: null,
    resize: vi.fn(async () => blob),
    makePath: vi.fn(() => PATH),
    upload: vi.fn(async () => ({ error: null })),
    save: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("runUploadPipeline", () => {
  it("resizes, uploads and saves, reporting the uploaded path", async () => {
    const d = deps({ onUploaded: vi.fn(), onStage: vi.fn() });
    await expect(runUploadPipeline(d)).resolves.toEqual({ ok: true, path: PATH });
    expect(d.upload).toHaveBeenCalledWith(PATH, blob);
    expect(d.save).toHaveBeenCalledWith(PATH);
    expect(d.onUploaded).toHaveBeenCalledWith(PATH);
    expect(d.onStage).toHaveBeenNthCalledWith(1, "resizing");
    expect(d.onStage).toHaveBeenNthCalledWith(2, "uploading");
    expect(d.onStage).toHaveBeenNthCalledWith(3, "saving");
  });

  it("with an existing path skips resize and upload and only saves (same path)", async () => {
    const d = deps({ existingPath: "g/old.webp" });
    await expect(runUploadPipeline(d)).resolves.toEqual({ ok: true, path: "g/old.webp" });
    expect(d.resize).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.save).toHaveBeenCalledWith("g/old.webp");
  });

  it("maps a resize throw to 'read' without uploading", async () => {
    const d = deps({ resize: vi.fn(async () => Promise.reject(new Error("decode"))) });
    await expect(runUploadPipeline(d)).resolves.toEqual({ ok: false, reason: "read", path: null, message: null });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("maps a webp-unsupported encode to 'encode'", async () => {
    const d = deps({ resize: vi.fn(async () => Promise.reject(new WebpUnsupportedError())) });
    await expect(runUploadPipeline(d)).resolves.toMatchObject({ ok: false, reason: "encode", path: null });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("maps an upload error result to 'upload' with no path", async () => {
    const d = deps({ upload: vi.fn(async () => ({ error: new Error("409") })) });
    await expect(runUploadPipeline(d)).resolves.toEqual({ ok: false, reason: "upload", path: null, message: null });
    expect(d.save).not.toHaveBeenCalled();
  });

  it("maps a thrown upload to 'upload' and never leaks the raw error", async () => {
    const d = deps({ upload: vi.fn(async () => Promise.reject(new Error("raw network text"))) });
    await expect(runUploadPipeline(d)).resolves.toEqual({ ok: false, reason: "upload", path: null, message: null });
  });

  it("keeps the uploaded path when save fails, passing the action message through", async () => {
    const d = deps({ save: vi.fn(async () => ({ ok: false as const, message: "Window closed." })) });
    await expect(runUploadPipeline(d)).resolves.toEqual({
      ok: false,
      reason: "save",
      path: PATH,
      message: "Window closed.",
    });
  });

  it("keeps the uploaded path when save throws, with no message", async () => {
    const d = deps({ save: vi.fn(async () => Promise.reject(new Error("fetch failed"))) });
    await expect(runUploadPipeline(d)).resolves.toEqual({ ok: false, reason: "save", path: PATH, message: null });
  });

  it("never rejects even if a stage callback throws", async () => {
    const d = deps({
      onStage: () => {
        throw new Error("setState blew up");
      },
    });
    await expect(runUploadPipeline(d)).resolves.toMatchObject({ ok: false, reason: "read" });
  });

  it("still reports the path if onUploaded throws after a successful upload", async () => {
    const d = deps({
      onUploaded: () => {
        throw new Error("ref blew up");
      },
    });
    await expect(runUploadPipeline(d)).resolves.toMatchObject({ ok: false, reason: "save", path: PATH });
  });
});
