// Next.js instrumentation hook — runs once at server startup
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only install in Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    // Version gate — must be called before any other chassis module
    const { requireMajor, port, PORT_HTTP } = await import('@ai8future/chassis');
    requireMajor(10);

    const { crashLogger, installCrashHandlers, startHealthMonitor, logStartup } =
      await import('@/lib/diagnostics');
    const registry = await import('@ai8future/registry');
    const { run } = await import('@ai8future/lifecycle');
    const { invalidateProjectCache } = await import('@/lib/scan-cache');
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Initialize OTel pipeline (before registry so trace IDs propagate)
    const otelEndpoint = process.env.OTEL_ENDPOINT ?? '';
    let shutdownOtel: (() => Promise<void>) | undefined;
    if (otelEndpoint) {
      try {
        const { initOtel } = await import('@ai8future/otel');
        let version = 'unknown';
        try { version = readFileSync(join(process.cwd(), 'VERSION'), 'utf-8').trim(); } catch {}
        shutdownOtel = initOtel({
          serviceName: 'code_manage',
          serviceVersion: version,
          endpoint: otelEndpoint,
          insecure: otelEndpoint.startsWith('http://'),
        });
      } catch (err) {
        crashLogger.warn({ err }, 'Failed to initialize OTel (non-fatal)');
      }
    }

    // Initialize kafkakit event bus (non-blocking)
    const { initEventBus } = await import('@/lib/eventbus');
    initEventBus();

    logStartup();
    installCrashHandlers(crashLogger);
    startHealthMonitor(crashLogger);

    // Declare port and custom commands before run() initializes registry
    const httpPort = port('code_manage', PORT_HTTP);
    registry.port(PORT_HTTP, httpPort, 'Next.js dev server');

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

        // Flush OTel on shutdown
        await shutdownOtel?.();
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
