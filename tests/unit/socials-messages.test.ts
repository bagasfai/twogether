import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

type Tree = { [k: string]: string | Tree };

function flatten(prefix: string, value: string | Tree, out: Record<string, string> = {}) {
  if (typeof value === "string") out[prefix] = value;
  else for (const [k, v] of Object.entries(value)) flatten(`${prefix}.${k}`, v, out);
  return out;
}

function collect(messages: { home: Tree; socials: Tree }) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(messages.home)) {
    if (/^(featured|socials|partnerCta)/.test(k)) flatten(`home.${k}`, v, out);
  }
  flatten("socials", messages.socials, out);
  return out;
}

const enKeys = collect(en as unknown as { home: Tree; socials: Tree });
const idKeys = collect(id as unknown as { home: Tree; socials: Tree });

describe("socials / featured / partnerCta messages", () => {
  it("has keys at all", () => {
    expect(Object.keys(enKeys).length).toBeGreaterThan(8);
  });

  it("carries the same keys in both locales", () => {
    expect(Object.keys(idKeys).sort()).toEqual(Object.keys(enKeys).sort());
  });

  it.each([
    ["en", enKeys],
    ["id", idKeys],
  ])("has non-empty values without banned wording in %s", (_l, keys) => {
    for (const value of Object.values(keys)) {
      expect(value.trim()).not.toBe("");
      expect(value).not.toMatch(/collab|kolaborasi|kerja sama/i);
    }
  });
});
