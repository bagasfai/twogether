const idr = new Intl.NumberFormat("id-ID");

export function formatIdr(amount: number): string {
  return `Rp${idr.format(amount)}`;
}
