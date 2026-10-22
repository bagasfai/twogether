import type { AppErrorCode } from "@/lib/errors/rpc";

// Server Actions return English `message` text; the upload panel renders in
// the viewer's locale, so it maps the stable `code` to a `gallery.*` message
// key instead and never shows the server's wording.
export type GalleryErrorKey =
  | "error.uploadNotEligible"
  | "error.uploadWindowClosed"
  | "error.uploadCapReached"
  | "error.invalidUpload"
  | "error.notAuthorized"
  | "error.invalidState"
  | "error.notAuthenticated";

const KEYS: Partial<Record<AppErrorCode, GalleryErrorKey>> = {
  upload_not_eligible: "error.uploadNotEligible",
  upload_window_closed: "error.uploadWindowClosed",
  upload_cap_reached: "error.uploadCapReached",
  invalid_upload: "error.invalidUpload",
  not_authorized: "error.notAuthorized",
  invalid_state: "error.invalidState",
  not_authenticated: "error.notAuthenticated",
};

export function galleryErrorKey<F extends string>(
  code: AppErrorCode | null | undefined,
  fallback: F,
): GalleryErrorKey | F {
  return (code && KEYS[code]) || fallback;
}
