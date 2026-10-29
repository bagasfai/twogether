import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import id from "@/messages/id.json";
import en from "@/messages/en.json";

type Tree = { [k: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, leaves(v, key));
  }
  return out;
}

const locales = { id: leaves(id as Tree), en: leaves(en as Tree) };

// Every message key the schema references, read from its source so a new
// error cannot be added without a translation.
function schemaKeys(): string[] {
  const src = readFileSync("lib/validation/partner-inquiry.ts", "utf8");
  return [...new Set(src.match(/partner\.errors\.[A-Za-z]+/g) ?? [])];
}

describe("partner messages", () => {
  it("has the same partner.* keys in both locales", () => {
    const pick = (m: Record<string, string>) =>
      Object.keys(m).filter((k) => k.startsWith("partner.")).sort();
    expect(pick(locales.id).length).toBeGreaterThan(10);
    expect(pick(locales.id)).toEqual(pick(locales.en));
  });

  it("has nav.partner and footer.partner in both locales", () => {
    for (const m of Object.values(locales)) {
      expect(m["nav.partner"]).toBeTruthy();
      expect(m["footer.partner"]).toBeTruthy();
    }
  });

  it("uses the agreed wording", () => {
    expect(locales.id["nav.partner"]).toBe("Kemitraan");
    expect(locales.en["nav.partner"]).toBe("Partner");
    expect(locales.id["partner.heroTitle"]).toBe("Jadi Partner Kami");
    expect(locales.en["partner.heroTitle"]).toBe("Partner with us");
  });

  it("never uses banned wording", () => {
    for (const m of Object.values(locales)) {
      for (const v of Object.values(m)) expect(v).not.toMatch(/collab|kolaborasi|kerja sama/i);
    }
  });

  it("defines every error key the schema emits, plus rate-limit and generic errors", () => {
    const keys = schemaKeys();
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const m of Object.values(locales)) {
      for (const k of keys) expect(m[k], k).toBeTruthy();
      expect(m["partner.rateLimited"]).toBeTruthy();
      expect(m["partner.genericError"]).toBeTruthy();
    }
  });
});
