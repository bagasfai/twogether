import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const PATTERN = /new Date\([^)]*\)\.toLocale(Date|Time)?String\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("date formatting guard", () => {
  it("has no unpinned toLocale*String calls in app/ or components/", () => {
    const offenders = ["app", "components"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .filter((f) => PATTERN.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(offenders, `Use lib/format/datetime instead in: ${offenders.join(", ")}`).toEqual([]);
  });
});
