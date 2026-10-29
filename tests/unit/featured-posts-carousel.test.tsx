import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import id from "@/messages/id.json";
import { FeaturedPostsCarousel } from "@/components/marketing/featured-posts-carousel";
import { socialVerbKey } from "@/lib/socials/verb";
import type { FeaturedPost } from "@/lib/dal/socials";

function post(n: number): FeaturedPost {
  return {
    id: `p${n}`,
    platform: "instagram",
    postUrl: `https://instagram.com/p/${n}`,
    imageUrl: `http://127.0.0.1:54331/storage/v1/object/public/featured-posts/${n}.webp`,
    imagePath: `${n}.webp`,
    captionEn: `English caption ${n}`,
    captionId: `Keterangan ${n}`,
    kind: "match",
    postedAt: "2026-10-01T00:00:00Z",
    isVisible: true,
  };
}

function render(posts: FeaturedPost[], locale: "id" | "en") {
  const messages = locale === "id" ? id : en;
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FeaturedPostsCarousel posts={posts} locale={locale} />
    </NextIntlClientProvider>,
  );
}

describe("FeaturedPostsCarousel", () => {
  it("renders nothing for no posts", () => {
    expect(render([], "en")).toBe("");
  });

  it("renders one external link and no prev/next for a single post", () => {
    const html = render([post(1)], "en");
    expect(html).toContain('href="https://instagram.com/p/1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("carousel-previous");
    expect(html).not.toContain("carousel-next");
  });

  it("renders prev/next for several posts", () => {
    const html = render([post(1), post(2), post(3), post(4)], "en");
    expect(html).toContain("carousel-previous");
    expect(html).toContain("carousel-next");
  });

  it("shows the locale's caption and translated kind", () => {
    const idHtml = render([post(1)], "id");
    expect(idHtml).toContain("Keterangan 1");
    expect(idHtml).not.toContain("English caption 1");
    expect(idHtml).toContain(id.socials.kinds.match);
    expect(render([post(1)], "en")).toContain("English caption 1");
  });
});

describe("socialVerbKey", () => {
  it.each([
    ["instagram", "follow"],
    ["tiktok", "follow"],
    ["whatsapp", "join"],
    ["ayo", "join"],
    ["other", "visit"],
  ] as const)("%s -> %s", (platform, verb) => {
    expect(socialVerbKey(platform)).toBe(verb);
  });
});
