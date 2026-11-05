import { formatDate } from "@/lib/format/datetime";

export const EMPTY = "—";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

// Display only; CSV exports plain integers.
export const money = (v: number | null | undefined) => (v == null ? EMPTY : idr.format(v));
export const percent = (v: number | null | undefined) => (v == null ? EMPTY : `${v}%`);
export const num = (v: number | null | undefined) => (v == null ? EMPTY : String(v));
export const date = (v: string | null | undefined) => (v ? formatDate(v) : EMPTY);
