// Next.js instrumentation hook — runs once at server startup
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only install in Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    // Version gate — must be called before any other chassis module
    const { requireMajor, PORT_HTTP } = await import('@ai8future/chassis');
    requireMajor(9);

    const { crashLogger, installCrashHandlers, startHealthMonitor, logStartup } =
      await import('@/lib/diagnostics');
    const registry = await import('@ai8future/registry');
    const { run } = await import('@ai8future/lifecycle');
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { invalidateProjectCache } = await import('@/lib/scan-cache');

    logStartup();
    installCrashHandlers(crashLogger);
    startHealthMonitor(crashLogger);

    // Read chassis version for registry metadata
    let chassisVersion = 'unknown';
    try {
      chassisVersion = readFileSync(join(process.cwd(), 'VERSION.chassis'), 'utf-8').trim();
    } catch { /* use default */ }

    // Declare port and custom commands before run() initializes registry
    registry.port(PORT_HTTP, 7491, 'Next.js dev server');

    registry.handle('invalidate-cache', 'Clear the project scan cache', () => {
      invalidateProjectCache();
      registry.status('project scan cache invalidated');
    });

    // lifecycle.run() handles SIGTERM/SIGINT, initializes registry,
    // starts heartbeat & command polling, and coordinates graceful shutdown.
    // We fire-and-forget since Next.js owns the HTTP server lifecycle.
    const lifecyclePromise = run(
      // Main component: keeps alive until abort signal, then shuts down cleanly
      async (signal) => {
        // Start xyops monitoring bridge if enabled
        const { getXyopsConfig } = await import('@/lib/env');
        const xyopsCfg = getXyopsConfig();
        if (xyopsCfg.baseUrl && xyopsCfg.apiKey) {
          const { XyopsClient } = await import('@/lib/xyops');
          const ops = new XyopsClient(xyopsCfg);
          ops.run(signal);
          registry.status('xyops monitoring bridge started');
        }

        registry.status('server initialized');

        // Wait until the abort signal fires (SIGTERM/SIGINT)
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
    );

    // Log lifecycle errors but don't crash Next.js
    lifecyclePromise.catch((err) => {
      crashLogger.error({ err }, 'Lifecycle run() exited with error');
    });
  }
}

export async function onRequestError(
  err: { digest: string } & Error,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string; renderSource: string },
) {
  // Only log in Node.js runtime
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    const { crashLogger, takeHealthSnapshot } = await import('@/lib/diagnostics');
    const registry = await import('@ai8future/registry');

    const msg = `Request error in ${context.routePath}: ${err.message}`;

    crashLogger.error(
      {
        err,
        request: { path: request.path, method: request.method },
        context,
        snapshot: takeHealthSnapshot(),
      },
      msg,
    );

    // Report to registry for operational visibility
    try { registry.error(msg, err); } catch { /* registry may not be initialized yet */ }
  }
}
