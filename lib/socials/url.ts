// Pure: the featured-posts bucket is public, so no Supabase client is needed
// to build the URL (same approach as lib/gallery/url.ts).
export function featuredPostImageUrl(
  imagePath: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL!,
): string {
  return `${baseUrl}/storage/v1/object/public/featured-posts/${imagePath}`;
}
