import type { SocialPlatform } from "@/components/marketing/social-icon";

export type SocialVerbKey = "follow" | "join" | "visit";

export function socialVerbKey(platform: SocialPlatform): SocialVerbKey {
  switch (platform) {
    case "instagram":
    case "tiktok":
      return "follow";
    case "whatsapp":
    case "ayo":
      return "join";
    default:
      return "visit";
  }
}
