import type { SOCIAL_PLATFORMS } from "@/lib/validation/socials";

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// Type-only import: no server-only code, safe for client and server components.
// Simple one-colour marks that inherit currentColor.
const PATHS: Record<SocialPlatform, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2 4.2 5 4.5" />,
  threads: (
    <path d="M18.6 8.2C17.7 5.4 15.3 3.8 12.1 3.8 7.4 3.8 4.6 7.1 4.6 12s2.8 8.2 7.5 8.2c3.7 0 6.3-2 6.3-5 0-2.8-2.2-4.4-5.3-4.4-2.5 0-4.2 1.2-4.2 2.9 0 1.6 1.3 2.6 3.1 2.6 3 0 4.4-2.3 4.4-5.6" />
  ),
  whatsapp: (
    <>
      <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.3z" />
      <path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z" />
    </>
  ),
  ayo: (
    <>
      <path d="M4 20L12 4l8 16" />
      <path d="M7.5 14h9" />
    </>
  ),
  other: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
};

export function SocialIcon({
  platform,
  className,
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-5"}
    >
      {PATHS[platform]}
    </svg>
  );
}
