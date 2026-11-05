export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null;
};

const BOM = "﻿";
const EOL = "\r\n";

// Spreadsheet formula-injection guard: only applies to strings, never numbers.
function guard(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cell(v: string | number | null): string {
  if (v === null) return "";
  if (typeof v === "number") return String(v);
  return quote(guard(v));
}

export function toCsv<T>(
  columns: CsvColumn<T>[],
  rows: T[],
  opts?: { note?: string },
): string {
  const lines = [columns.map((c) => quote(guard(c.header))).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(c.value(row))).join(","));
  }
  if (opts?.note !== undefined) lines.push(cell(opts.note));
  return BOM + lines.join(EOL) + EOL;
}
