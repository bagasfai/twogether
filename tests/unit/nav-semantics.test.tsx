import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SkipLink } from "@/components/skip-link";
import { NavLinks } from "@/components/nav/nav-links";

vi.mock("next/navigation", () => ({ usePathname: () => "/sessions/new" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/faq",
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const items = [
  { href: "/sessions", label: "Sessions" },
  { href: "/sessions/new", label: "New session" },
  { href: "/faq", label: "FAQ" },
];

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

describe("SkipLink", () => {
  it("links to #main, hidden until focused, with a focus style", () => {
    const html = renderToStaticMarkup(<SkipLink />);
    expect(html).toContain('href="#main"');
    expect(html).toContain("Skip to content");
    expect(html).toContain("sr-only");
    expect(html).toContain("focus:not-sr-only");
    expect(html).toMatch(/focus:(ring|outline)/);
  });
});

describe("NavLinks", () => {
  it("marks exactly one link current (non-localized)", () => {
    const html = renderToStaticMarkup(<NavLinks items={items} />);
    expect(count(html, 'aria-current="page"')).toBe(1);
    expect(html).toMatch(/aria-current="page"[^>]*>New session|>New session<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/sessions\/new"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/sessions\/new"/);
  });
  it("marks exactly one link current (localized)", () => {
    const html = renderToStaticMarkup(<NavLinks items={items} localized />);
    expect(count(html, 'aria-current="page"')).toBe(1);
    expect(html).toMatch(/<a[^>]*href="\/faq"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/faq"/);
  });
  it("labels the nav landmark", () => {
    expect(renderToStaticMarkup(<NavLinks items={items} />)).toContain('<nav aria-label="Main"');
  });
  it("styles the active link", () => {
    const html = renderToStaticMarkup(<NavLinks items={items} />);
    expect(html).toContain("text-accent-text");
    expect(html).toContain("font-medium");
  });
});

describe("layout landmarks (source)", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it.each(["app/(app)/layout.tsx", "app/[locale]/(marketing)/layout.tsx"])(
    "%s renders SkipLink before the header",
    (p) => {
      const src = read(p);
      expect(src).toContain("<SkipLink />");
      expect(src.indexOf("<SkipLink />")).toBeLessThan(src.indexOf("<header"));
      expect(src).toContain("<NavLinks");
    },
  );
  it.each(["app/(app)/layout.tsx", "app/[locale]/(marketing)/layout.tsx", "app/(auth)/layout.tsx"])(
    "%s has main#main",
    (p) => {
      expect(read(p)).toContain('id="main"');
    },
  );
});
