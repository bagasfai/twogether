// A premium participant owes the session's surcharge instead of its price;
// everyone else owes the price. Open play sets the surcharge to 0, so a
// premium entry there owes nothing (their membership covers it).
export function amountOwed(
  session: { price: number; premiumSurchargeIdr: number },
  entry: { isPremium: boolean },
): number {
  return entry.isPremium ? session.premiumSurchargeIdr : session.price;
}

// After a seat hand-off the replacement sits on the row but the original
// member may still be the one who pays; paid_by_user_id records that.
export function payerUserId(entry: { userId: string | null; paidByUserId: string | null }): string | null {
  return entry.paidByUserId ?? entry.userId;
}
