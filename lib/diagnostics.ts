// Crash logging & diagnostics — survives process death via sync file writes
import pino from 'pino';
import { env } from './env';

// ---------------------------------------------------------------------------
// Crash-safe file logger (sync writes to .next/crash.log)
// ---------------------------------------------------------------------------

const crashLogPath = '.next/crash.log';

export const crashLogger = pino(
  {
    level: 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({ dest: crashLogPath, sync: true, mkdir: true }),
);

// ---------------------------------------------------------------------------
// Health snapshot
// ---------------------------------------------------------------------------

export interface HealthSnapshot {
  rssBytes: number;
  rssMB: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  uptimeSeconds: number;
  activeHandles: number;
  activeRequests: number;
  inflightCount: number;
  pid: number;
}

export function takeHealthSnapshot(): HealthSnapshot {
  const mem = process.memoryUsage();
  return {
    rssBytes: mem.rss,
    rssMB: Math.round(mem.rss / 1024 / 1024),
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    externalBytes: mem.external,
    uptimeSeconds: Math.round(process.uptime()),
    // @ts-expect-error — _getActiveHandles exists on Node but is not in @types/node
    activeHandles: (process._getActiveHandles?.()?.length as number) ?? -1,
    // @ts-expect-error — _getActiveRequests exists on Node but is not in @types/node
    activeRequests: (process._getActiveRequests?.()?.length as number) ?? -1,
    inflightCount: inflightRequests.size,
    pid: process.pid,
  };
}

// ---------------------------------------------------------------------------
// Inflight request tracking
// ---------------------------------------------------------------------------

export interface InflightEntry {
  route: string;
  requestId: string | undefined;
  startedAt: number;
}

export const inflightRequests = new Map<string, InflightEntry>();

let inflightSeq = 0;

/** Start tracking an inflight request. Returns an opaque key for `trackRequestEnd`. */
export function trackRequestStart(route: string, requestId?: string): string {
  const key = `req-${++inflightSeq}`;
  inflightRequests.set(key, { route, requestId, startedAt: Date.now() });
  return key;
}

/** Mark a tracked request as completed. */
export function trackRequestEnd(key: string): void {
  inflightRequests.delete(key);
}

// ---------------------------------------------------------------------------
// Crash handlers
// ---------------------------------------------------------------------------

let crashHandlersInstalled = false;

export function installCrashHandlers(log: pino.Logger): void {
  if (crashHandlersInstalled) return;
  crashHandlersInstalled = true;

  const dumpContext = (label: string, error: unknown) => {
    const snapshot = takeHealthSnapshot();
    const inflight = Array.from(inflightRequests.entries()).map(([key, entry]) => ({
      key,
      ...entry,
      durationMs: Date.now() - entry.startedAt,
    }));
    log.fatal({ label, err: error, snapshot, inflight }, `${label}: ${error}`);
  };

  process.on('unhandledRejection', (reason) => {
    dumpContext('unhandledRejection', reason);
  });

  process.on('uncaughtException', (error) => {
    dumpContext('uncaughtException', error);
    // Let the process crash naturally after logging
  });

  process.on('SIGTERM', () => {
    log.info(takeHealthSnapshot(), 'Received SIGTERM — shutting down');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log.info(takeHealthSnapshot(), 'Received SIGINT — shutting down');
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Periodic health monitor
// ---------------------------------------------------------------------------

const RSS_WARN_THRESHOLD = 512 * 1024 * 1024; // 512 MB
const HEALTH_INTERVAL_MS = 60_000; // 60s

let healthTimer: ReturnType<typeof setInterval> | null = null;

export function startHealthMonitor(log: pino.Logger): void {
  if (healthTimer) return;

  healthTimer = setInterval(() => {
    const snapshot = takeHealthSnapshot();
    if (snapshot.rssBytes > RSS_WARN_THRESHOLD) {
      log.warn(snapshot, `High memory: RSS ${snapshot.rssMB}MB exceeds ${RSS_WARN_THRESHOLD / 1024 / 1024}MB threshold`);
    } else {
      log.debug(snapshot, `Health check: RSS ${snapshot.rssMB}MB, heap ${Math.round(snapshot.heapUsedBytes / 1024 / 1024)}MB, inflight ${snapshot.inflightCount}`);
    }
  }, HEALTH_INTERVAL_MS);

  // Don't prevent graceful shutdown
  if (healthTimer.unref) healthTimer.unref();
}

// ---------------------------------------------------------------------------
// Dev-mode console logger (for startup/shutdown outside of pino-pretty)
// ---------------------------------------------------------------------------

export function logStartup(): void {
  const snapshot = takeHealthSnapshot();
  crashLogger.info(
    snapshot,
    `Server starting — PID ${snapshot.pid}, RSS ${snapshot.rssMB}MB, env=${env.nodeEnv}`,
  );
}
