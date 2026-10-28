import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blend, contrastRatio, parseTokens, toRgb } from "./helpers/contrast";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const root = parseTokens(css, ":root");

function ratio(fg: string, bg: string) {
  if (!root[fg]) throw new Error(`missing token --${fg}`);
  if (!root[bg]) throw new Error(`missing token --${bg}`);
  return contrastRatio(toRgb(root[fg]), toRgb(root[bg]));
}

describe("light theme contrast", () => {
  const textPairs: [string, string][] = [
    ["foreground", "background"],
    ["muted-foreground", "background"],
    ["accent-text", "background"],
    ["success-text", "background"],
    ["destructive-text", "background"],
    ["foreground", "accent"],
    ["accent-foreground", "accent"],
  ];
  it.each(textPairs)("%s on %s >= 4.5", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("success-text on success badge tint >= 4.5", () => {
    const bg = toRgb(root["background"]);
    const tint = blend(toRgb(root["success"]), bg, 0.15);
    expect(contrastRatio(toRgb(root["success-text"]), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("input border on background >= 3", () => {
    expect(ratio("input", "background")).toBeGreaterThanOrEqual(3);
  });
});
