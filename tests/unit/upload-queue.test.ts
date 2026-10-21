import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "@/lib/gallery/upload-queue";

function tick(ms = 1) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe("runWithConcurrency", () => {
  it("never has more than `limit` workers in flight", async () => {
    let inFlight = 0;
    let peak = 0;

    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
    });

    expect(peak).toBe(3);
    expect(inFlight).toBe(0);
  });

  it("runs every item exactly once", async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      await tick(6 - n);
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps going after a worker rejects and does not throw", async () => {
    const seen: number[] = [];
    await expect(
      runWithConcurrency([1, 2, 3, 4, 5], 3, async (n) => {
        await tick();
        if (n === 2) throw new Error("boom");
        seen.push(n);
      }),
    ).resolves.toBeUndefined();
    expect(seen.sort()).toEqual([1, 3, 4, 5]);
  });

  it("does not throw when the worker throws synchronously", async () => {
    const seen: number[] = [];
    await expect(
      runWithConcurrency([1, 2, 3], 2, (n) => {
        if (n === 1) throw new Error("sync boom");
        seen.push(n);
        return Promise.resolve();
      }),
    ).resolves.toBeUndefined();
    expect(seen.sort()).toEqual([2, 3]);
  });

  it("resolves immediately for an empty list", async () => {
    let calls = 0;
    await runWithConcurrency([], 3, async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
  });

  it("treats a limit below 1 as 1", async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithConcurrency([1, 2, 3], 0, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
    });
    expect(peak).toBe(1);
  });
});
