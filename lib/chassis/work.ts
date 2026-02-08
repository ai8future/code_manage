// Adapted from @ai8future/work v4 — structured concurrency patterns
// Simplified for Next.js: no OTel spans, no version gate

import { availableParallelism } from 'os';

function defaultWorkers(): number {
  return availableParallelism?.() ?? 4;
}

function resolveWorkers(override?: number): number {
  const workers = override ?? defaultWorkers();
  if (!Number.isFinite(workers) || workers < 1) {
    throw new RangeError(`workers must be >= 1, got ${workers}`);
  }
  return workers;
}

export interface WorkOptions {
  workers?: number;
}

export interface Result<T> {
  value?: T;
  error?: Error;
  index: number;
}

// ---------- Semaphore ----------

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.active--;
    }
  }
}

// ---------- workMap ----------

/**
 * Process items concurrently with bounded parallelism.
 * Returns Results in input order.
 */
export async function workMap<T, R>(
  items: T[],
  fn: (item: T, ctx: { signal: AbortSignal }) => Promise<R>,
  opts?: WorkOptions,
): Promise<Result<R>[]> {
  const workers = resolveWorkers(opts?.workers);
  const sem = new Semaphore(workers);
  const ac = new AbortController();

  const promises = items.map(async (item, index): Promise<Result<R>> => {
    await sem.acquire();
    try {
      if (ac.signal.aborted) {
        return { error: new Error('aborted'), index };
      }
      const value = await fn(item, { signal: ac.signal });
      return { value, index };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)), index };
    } finally {
      sem.release();
    }
  });

  return Promise.all(promises);
}

// ---------- workRace ----------

/**
 * Launch all tasks concurrently; return the result of the first to succeed.
 * Remaining tasks are signalled to abort.
 */
export async function workRace<R>(
  ...tasks: ((ctx: { signal: AbortSignal }) => Promise<R>)[]
): Promise<R> {
  if (tasks.length === 0) {
    throw new Error('workRace requires at least one task');
  }

  const ac = new AbortController();
  const errors: Error[] = [];
  let resolved = false;

  return new Promise<R>((resolve, reject) => {
    let remaining = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;
      task({ signal: ac.signal })
        .then((value) => {
          if (!resolved) {
            resolved = true;
            ac.abort();
            resolve(value);
          }
        })
        .catch((err) => {
          errors.push(err instanceof Error ? err : new Error(String(err)));
          remaining--;
          if (remaining === 0 && !resolved) {
            reject(new AggregateError(errors, `all ${tasks.length} tasks failed`));
          }
        });
    }
  });
}

// ---------- workAll ----------

/**
 * Run heterogeneous tasks with bounded concurrency.
 * Returns Results for each task.
 */
export async function workAll(
  tasks: ((ctx?: { signal: AbortSignal }) => Promise<unknown>)[],
  opts?: WorkOptions,
): Promise<Result<unknown>[]> {
  return workMap(
    tasks,
    async (task, ctx) => {
      return task(ctx);
    },
    opts,
  );
}

// ---------- workStream ----------

/**
 * Process items from an async iterable with bounded concurrency,
 * yielding results as they complete.
 */
export async function* workStream<T, R>(
  iter: AsyncIterable<T>,
  fn: (item: T, ctx: { signal: AbortSignal }) => Promise<R>,
  opts?: WorkOptions,
): AsyncGenerator<Result<R>> {
  const workers = resolveWorkers(opts?.workers);
  const sem = new Semaphore(workers);
  const ac = new AbortController();
  const results: Result<R>[] = [];
  const pending: Promise<void>[] = [];
  let index = 0;

  for await (const item of iter) {
    if (ac.signal.aborted) break;

    await sem.acquire();
    const currentIndex = index++;
    const currentItem = item;

    const p = (async () => {
      try {
        const value = await fn(currentItem, { signal: ac.signal });
        results.push({ value, index: currentIndex });
      } catch (err) {
        results.push({
          error: err instanceof Error ? err : new Error(String(err)),
          index: currentIndex,
        });
      } finally {
        sem.release();
      }
    })();
    pending.push(p);

    // Yield any completed results
    while (results.length > 0) {
      yield results.shift()!;
    }
  }

  // Wait for remaining work
  await Promise.all(pending);

  // Yield remaining results
  while (results.length > 0) {
    yield results.shift()!;
  }
}
