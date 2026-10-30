import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { featuredPostImageUrl } from "@/lib/socials/url";
import type { Database } from "@/types/supabase";

type SocialLinkRow = Database["public"]["Tables"]["social_links"]["Row"];
type FeaturedPostRow = Database["public"]["Tables"]["featured_posts"]["Row"];

export type SocialLink = {
  id: string;
  platform: SocialLinkRow["platform"];
  url: string;
  label: string;
  sortOrder: number;
  isVisible: boolean;
};

export type FeaturedPost = {
  id: string;
  platform: FeaturedPostRow["platform"];
  postUrl: string;
  /** Public storage URL of the image. */
  imageUrl: string;
  imagePath: string;
  captionEn: string;
  captionId: string;
  kind: FeaturedPostRow["kind"];
  postedAt: string;
  isVisible: boolean;
};

function toSocialLink(row: SocialLinkRow): SocialLink {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    label: row.label,
    sortOrder: row.sort_order,
    isVisible: row.is_visible,
  };
}

function toFeaturedPost(row: FeaturedPostRow): FeaturedPost {
  return {
    id: row.id,
    platform: row.platform,
    postUrl: row.post_url,
    imageUrl: featuredPostImageUrl(row.image_path),
    imagePath: row.image_path,
    captionEn: row.caption_en,
    captionId: row.caption_id,
    kind: row.kind,
    postedAt: row.posted_at,
    isVisible: row.is_visible,
  };
}

// Public reads return [] on error so a broken query hides the section instead
// of crashing the landing page.
export async function listVisibleSocialLinks(): Promise<SocialLink[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("social_links")
    .select("*")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Failed to load social links", error.message);
    return [];
  }
  return (data ?? []).map(toSocialLink);
}

export async function listLatestFeaturedPosts(limit = 6): Promise<FeaturedPost[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("featured_posts")
    .select("*")
    .eq("is_visible", true)
    .order("posted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("Failed to load featured posts", error.message);
    return [];
  }
  return (data ?? []).map(toFeaturedPost);
}

export async function listSocialLinksForAdmin(): Promise<SocialLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_links")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to load social links: ${error.message}`);
  return (data ?? []).map(toSocialLink);
}

export async function listFeaturedPostsForAdmin(): Promise<FeaturedPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("featured_posts")
    .select("*")
    .order("posted_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load featured posts: ${error.message}`);
  return (data ?? []).map(toFeaturedPost);
}
