export function avatarPublicUrl(
  supabaseUrl: string,
  userId: string,
  ext: "webp" | "jpg",
  version: number,
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/avatars/${userId}/avatar.${ext}?v=${version}`;
}

const BUCKET_PATH = "/storage/v1/object/public/avatars/";
const GOOGLE_AVATAR_HOST = "lh3.googleusercontent.com";

function supabaseOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

export function isAllowedAvatarSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  const own = supabaseOrigin();
  if (own && url.origin === own && url.pathname.startsWith(BUCKET_PATH)) return true;
  return url.protocol === "https:" && url.hostname === GOOGLE_AVATAR_HOST;
}
