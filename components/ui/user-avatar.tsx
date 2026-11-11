"use client";

import * as React from "react";
import Image from "next/image";

import { isAllowedAvatarSrc } from "@/lib/avatar/url";
import { avatarColorIndex, getInitials } from "@/lib/avatar/initials";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: { px: 20, text: "text-[9px]" },
  sm: { px: 28, text: "text-xs" },
  md: { px: 40, text: "text-sm" },
  lg: { px: 96, text: "text-3xl" },
} as const;

const PALETTE = [
  "bg-primary text-primary-foreground",
  "bg-sky-deep text-primary-foreground",
  "bg-success-text text-success-foreground",
  "bg-destructive-text text-primary-foreground",
  "bg-muted-foreground text-primary-foreground",
  "bg-cork text-foreground",
] as const;

type UserAvatarProps = {
  name: string | null | undefined;
  id?: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  decorative?: boolean;
  className?: string;
};

export function shouldShowImage(src: string | null | undefined, failedSrc: string | null): boolean {
  return isAllowedAvatarSrc(src) && src !== failedSrc;
}

type ViewProps = UserAvatarProps & {
  failedSrc: string | null;
  onError: () => void;
};

export function UserAvatarView({
  name,
  id,
  src,
  size = "md",
  decorative = true,
  className,
  failedSrc,
  onError,
}: ViewProps) {
  const { px, text } = SIZES[size];
  const showImage = shouldShowImage(src, failedSrc);
  const palette = PALETTE[avatarColorIndex(id ?? name ?? "", PALETTE.length)];
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": name ?? undefined } as const);

  return (
    <span
      {...a11y}
      style={{ width: px, height: px }}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        !showImage && palette,
        !showImage && text,
        className,
      )}
    >
      {showImage && src ? (
        <Image
          src={src}
          alt=""
          width={px}
          height={px}
          unoptimized
          referrerPolicy="no-referrer"
          onError={onError}
          className="size-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

export function UserAvatar(props: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  return (
    <UserAvatarView
      {...props}
      failedSrc={failedSrc}
      onError={() => setFailedSrc(props.src ?? null)}
    />
  );
}
