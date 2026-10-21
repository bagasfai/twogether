import { describe, expect, it } from "vitest";
import { isConfirmed, remainingSeconds } from "@/lib/gallery/hold-timer";

describe("remainingSeconds", () => {
  it("rounds the remaining time up to whole seconds", () => {
    expect(remainingSeconds(0, 600)).toBe(1);
    expect(remainingSeconds(300, 600)).toBe(1);
    expect(remainingSeconds(599, 600)).toBe(1);
    expect(remainingSeconds(0, 2500)).toBe(3);
    expect(remainingSeconds(1500, 2500)).toBe(1);
  });

  it("is 0 once the hold is complete and never negative", () => {
    expect(remainingSeconds(600, 600)).toBe(0);
    expect(remainingSeconds(900, 600)).toBe(0);
  });
});

describe("isConfirmed", () => {
  it("is false until the hold time has elapsed", () => {
    expect(isConfirmed(0, 600)).toBe(false);
    expect(isConfirmed(300, 600)).toBe(false);
    expect(isConfirmed(599, 600)).toBe(false);
  });

  it("is true at or past the hold time", () => {
    expect(isConfirmed(600, 600)).toBe(true);
    expect(isConfirmed(601, 600)).toBe(true);
  });
});
