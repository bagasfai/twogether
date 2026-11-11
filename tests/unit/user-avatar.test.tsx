import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserAvatar, UserAvatarView, shouldShowImage } from "@/components/ui/user-avatar";

const SRC = "http://127.0.0.1:54331/storage/v1/object/public/avatars/u1/avatar.webp?v=1";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54331");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function html(props: Parameters<typeof UserAvatar>[0]) {
  return renderToStaticMarkup(<UserAvatar {...props} />);
}

function findImg(node: ReactNode): ReactElement<{ onError?: () => void }> | null {
  if (!isValidElement(node)) return null;
  const props = node.props as { children?: ReactNode; src?: string };
  if (props.src) return node as ReactElement<{ onError?: () => void }>;
  for (const child of Array.isArray(props.children) ? props.children : [props.children]) {
    const found = findImg(child);
    if (found) return found;
  }
  return null;
}

describe("UserAvatar", () => {
  it.each([
    ["xs", 20],
    ["sm", 28],
    ["md", 40],
    ["lg", 96],
  ] as const)("renders one img with fixed %s dimensions", (size, px) => {
    const out = html({ name: "Ada Lovelace", src: SRC, size });
    expect(out.match(/<img/g)).toHaveLength(1);
    expect(out).toContain(`width="${px}"`);
    expect(out).toContain(`height="${px}"`);
  });

  it("renders initials and no img without src", () => {
    const out = html({ name: "Ada Lovelace" });
    expect(out).not.toContain("<img");
    expect(out).toContain(">AL<");
  });

  it("renders initials for empty src", () => {
    const out = html({ name: "Ada Lovelace", src: "" });
    expect(out).not.toContain("<img");
    expect(out).toContain(">AL<");
  });

  it("renders initials and no img for a disallowed src", () => {
    const out = html({ name: "Ada Lovelace", src: "https://evil.example/pixel.png" });
    expect(out).not.toContain("<img");
    expect(out).toContain(">AL<");
  });

  it("sets no-referrer on the img", () => {
    expect(html({ name: "Ada", src: SRC })).toContain('referrerPolicy="no-referrer"');
  });

  it("shows ? for a null name", () => {
    expect(html({ name: null })).toContain(">?<");
  });

  it("is aria-hidden by default", () => {
    const out = html({ name: "Ada" });
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain('role="img"');
  });

  it("exposes role img and label when not decorative", () => {
    const out = html({ name: "Ada", decorative: false });
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Ada"');
    expect(out).not.toContain("aria-hidden");
  });

  it("gives the same id the same color class", () => {
    const a = html({ name: "A", id: "user-1" });
    const b = html({ name: "B", id: "user-1" });
    const cls = (s: string) => s.match(/bg-[\w-]+/)?.[0];
    expect(cls(a)).toBeTruthy();
    expect(cls(a)).toBe(cls(b));
  });

  it("falls back to name for color when id is missing", () => {
    const cls = (s: string) => s.match(/bg-[\w-]+/)?.[0];
    const first = cls(html({ name: "Ada" }));
    expect(first).toBeTruthy();
    expect(cls(html({ name: "Ada" }))).toBe(first);
  });
});

describe("UserAvatarView error handling", () => {
  it("swaps to initials once the current src has failed", () => {
    const view = UserAvatarView({ name: "Ada Lovelace", src: SRC, failedSrc: SRC, onError: vi.fn() });
    expect(findImg(view)).toBeNull();
    expect(renderToStaticMarkup(view)).toContain(">AL<");
  });

  it("shows the image again when src changes after an error", () => {
    const next = `${SRC}2`;
    expect(shouldShowImage(next, SRC)).toBe(true);
    expect(shouldShowImage(SRC, SRC)).toBe(false);
    const view = UserAvatarView({ name: "Ada", src: next, failedSrc: SRC, onError: vi.fn() });
    expect(findImg(view)).not.toBeNull();
  });

  it("treats a disallowed src like no src", () => {
    const bad = "https://evil.example/pixel.png";
    expect(shouldShowImage(bad, null)).toBe(false);
    const view = UserAvatarView({ name: "Ada Lovelace", src: bad, failedSrc: null, onError: vi.fn() });
    expect(findImg(view)).toBeNull();
    expect(renderToStaticMarkup(view)).toContain(">AL<");
  });

  it("wires img onError to the failure callback", () => {
    const onError = vi.fn();
    const view = UserAvatarView({ name: "Ada", src: SRC, failedSrc: null, onError });
    findImg(view)?.props.onError?.();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
