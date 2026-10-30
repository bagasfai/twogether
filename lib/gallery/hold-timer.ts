// Pure arithmetic behind HoldToConfirmButton, kept separate so it is
// unit-testable without a DOM.

// Whole seconds left, rounded up, so a 600ms hold announces "1" from the start
// and "0" only once confirmed.
export function remainingSeconds(heldMs: number, holdMs: number): number {
  return Math.max(0, Math.ceil((holdMs - heldMs) / 1000));
}

export function isConfirmed(heldMs: number, holdMs: number): boolean {
  return heldMs >= holdMs;
}
