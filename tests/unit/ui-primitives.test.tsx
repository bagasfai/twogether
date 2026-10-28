import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("touch targets", () => {
  it("default Button is 44px below md, 36px from md", () => {
    const m = html(createElement(Button, null, "x"));
    expect(m).toContain("max-md:h-11");
    expect(m).toContain("h-9");
  });
  it("sm Button is 44px below md", () => {
    const m = html(createElement(Button, { size: "sm" }, "x"));
    expect(m).toContain("max-md:h-11");
    expect(m).toContain("h-9");
  });
  it("icon Button is size-11 md:size-9", () => {
    const m = html(createElement(Button, { size: "icon" }, "x"));
    expect(m).toContain("max-md:size-11");
    expect(m).toContain("size-9");
  });
  it("Input is 44px below md", () => {
    const m = html(createElement(Input));
    expect(m).toContain("max-md:h-11");
    expect(m).toContain("h-9");
  });

  it("explicit h-11 override replaces the md+ height", () => {
    const m = html(createElement(Button, { className: "h-11" }, "x"));
    expect(m).toContain("h-11");
    expect(m).not.toContain("h-9");
    const i = html(createElement(Input, { className: "h-11" }));
    expect(i).not.toContain("h-9");
  });
  it("explicit h-8 override wins at md+", () => {
    const m = html(createElement(Button, { className: "h-8" }, "x"));
    expect(m).toContain("h-8");
    expect(m).not.toContain("h-9");
  });
});

describe("reduced motion", () => {
  it("Button has no hover translate", () => {
    expect(html(createElement(Button, null, "x"))).not.toContain("hover:-translate-y-px");
  });
  it("globals.css honours prefers-reduced-motion", () => {
    expect(readFileSync("app/globals.css", "utf8")).toContain("prefers-reduced-motion: reduce");
  });
});
