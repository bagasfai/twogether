// Pure so it is unit-testable and usable from client components: the bucket is
// public, so no Supabase client is needed to build the URL.
export function galleryPhotoUrl(
  storagePath: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL!,
): string {
  return `${baseUrl}/storage/v1/object/public/gallery/${storagePath}`;
}
