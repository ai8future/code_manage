// Adapted from @ai8future/work — bounded concurrency for fan-out workloads
// Simplified for Next.js: no OTel spans, no version gate, no AbortSignal propagation

import { availableParallelism } from 'os';

export interface Result<T> {
  value?: T;
  error?: Error;
  index: number;
}

/**
 * Process items concurrently with bounded parallelism. Returns results in input order.
 * Failed items have `error` set instead of `value` — partial failures don't crash the batch.
 */
export async function workMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts?: { workers?: number },
): Promise<Result<R>[]> {
  const workers = opts?.workers ?? availableParallelism();
  const results: Result<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        const value = await fn(items[index], index);
        results[index] = { value, index };
      } catch (err) {
        results[index] = { error: err instanceof Error ? err : new Error(String(err)), index };
      }
    }
  }

  const workerCount = Math.min(workers, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
