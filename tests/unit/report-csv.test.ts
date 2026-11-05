import { describe, expect, it } from "vitest";
import { toCsv, type CsvColumn } from "@/lib/reports/csv";

type Row = { name: string | null; n: number | null };
const cols: CsvColumn<Row>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "N", value: (r) => r.n },
];
const BOM = "﻿";

describe("toCsv", () => {
  it("starts with UTF-8 BOM", () => {
    expect(toCsv(cols, []).startsWith(BOM)).toBe(true);
  });

  it("header row then rows, CRLF endings", () => {
    const out = toCsv(cols, [{ name: "a", n: 1 }, { name: "b", n: 2 }]);
    expect(out).toBe(`${BOM}Name,N\r\na,1\r\nb,2\r\n`);
  });

  it("quotes cells containing comma, quote, newline and doubles quotes", () => {
    const out = toCsv(cols, [
      { name: "a,b", n: 1 },
      { name: 'say "hi"', n: 2 },
      { name: "x\ny", n: 3 },
    ]);
    expect(out).toContain('"a,b",1\r\n');
    expect(out).toContain('"say ""hi""",2\r\n');
    expect(out).toContain('"x\ny",3\r\n');
  });

  it("null renders empty", () => {
    expect(toCsv(cols, [{ name: null, n: null }])).toBe(`${BOM}Name,N\r\n,\r\n`);
  });

  it("numbers rendered plain", () => {
    expect(toCsv(cols, [{ name: "a", n: 1234567 }])).toContain("a,1234567\r\n");
  });

  it("prefixes ' to cells starting with = + - @ tab CR", () => {
    const out = toCsv(cols, [
      { name: "=SUM(A1)", n: 1 },
      { name: "-Budi", n: 2 },
      { name: "+1", n: 3 },
      { name: "@x", n: 4 },
      { name: "\tx", n: 5 },
      { name: "\rx", n: 6 },
      { name: "ok", n: -5 },
    ]);
    expect(out).toContain("'=SUM(A1),1\r\n");
    expect(out).toContain("'-Budi,2\r\n");
    expect(out).toContain("'+1,3\r\n");
    expect(out).toContain("'@x,4\r\n");
    expect(out).toContain("'\tx,5\r\n");
    expect(out).toContain("\"'\rx\",6\r\n");
    expect(out).toContain("ok,-5\r\n");
  });

  it("empty rows returns header only", () => {
    expect(toCsv(cols, [])).toBe(`${BOM}Name,N\r\n`);
  });

  it("note appended as a final row whose first cell is the note", () => {
    const out = toCsv(cols, [{ name: "a", n: 1 }], { note: "Truncated at 5000 rows" });
    expect(out).toBe(`${BOM}Name,N\r\na,1\r\nTruncated at 5000 rows\r\n`);
  });
});
