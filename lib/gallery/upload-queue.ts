// Runs `worker` over `items` with at most `limit` calls in flight. Failures are
// the worker's to record (the upload panel marks the file as failed), so a
// rejected or throwing worker never stops the queue and this never rejects.
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;

  async function lane() {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await worker(item);
      } catch {
        // Swallowed on purpose; see above.
      }
    }
  }

  const lanes = Math.min(Math.max(1, Math.floor(limit)), items.length);
  await Promise.all(Array.from({ length: lanes }, lane));
}
