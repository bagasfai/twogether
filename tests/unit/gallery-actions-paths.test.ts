import { describe, expect, it } from "vitest";
import { galleryRevalidationPaths } from "@/lib/gallery/revalidate";
import { galleryPhotoUrl } from "@/lib/gallery/url";

describe("galleryRevalidationPaths", () => {
  it("returns index and album page when there is no session", () => {
    expect(galleryRevalidationPaths("a1", null)).toEqual([
      { path: "/[locale]/(marketing)/gallery", type: "page" },
      { path: "/[locale]/(marketing)/gallery/[id]", type: "page" },
    ]);
  });

  it("adds the public session page and manage page when linked to a session", () => {
    expect(galleryRevalidationPaths("a1", "s1")).toEqual([
      { path: "/[locale]/(marketing)/gallery", type: "page" },
      { path: "/[locale]/(marketing)/gallery/[id]", type: "page" },
      { path: "/[locale]/(marketing)/sessions/[id]", type: "page" },
      { path: "/sessions/s1/manage" },
    ]);
  });
});

describe("galleryPhotoUrl", () => {
  it("builds the public storage URL", () => {
    expect(galleryPhotoUrl("g/p.webp", "http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/gallery/g/p.webp",
    );
  });
});
