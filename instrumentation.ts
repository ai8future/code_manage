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
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { invalidateProjectCache } = await import('@/lib/scan-cache');

    logStartup();
    installCrashHandlers(crashLogger);
    startHealthMonitor(crashLogger);

    // Initialize chassis registry — writes PID.json to /tmp/chassis/<service>/
    let chassisVersion = 'unknown';
    try {
      chassisVersion = readFileSync(join(process.cwd(), 'VERSION.chassis'), 'utf-8').trim();
    } catch { /* use default */ }

    const ac = new AbortController();
    registry.port(PORT_HTTP, 7491, 'Next.js dev server');

    // Register custom commands before init() so they appear in PID.json
    registry.handle('invalidate-cache', 'Clear the project scan cache', () => {
      invalidateProjectCache();
      registry.status('project scan cache invalidated');
    });

    registry.init(ac, chassisVersion);

    // Start heartbeat and command polling in background
    registry.startHeartbeat(ac.signal);
    registry.startCommandPoll(ac.signal);

    // Start xyops monitoring bridge if enabled
    const { getXyopsConfig } = await import('@/lib/env');
    const xyopsCfg = getXyopsConfig();
    if (xyopsCfg.baseUrl && xyopsCfg.apiKey) {
      const { XyopsClient } = await import('@/lib/xyops');
      const ops = new XyopsClient(xyopsCfg);
      ops.run(ac.signal);
      registry.status('xyops monitoring bridge started');
    }

    registry.status('server initialized');

    // Clean shutdown: abort registry loops and write shutdown event
    const shutdownRegistry = () => {
      ac.abort();
      registry.shutdown(`process exit (PID ${process.pid})`);
    };
    process.on('SIGTERM', shutdownRegistry);
    process.on('SIGINT', shutdownRegistry);
    process.on('exit', () => {
      // Last-chance sync cleanup if signal handlers didn't run (e.g., SIGKILL)
      registry.shutdown(`process exit (PID ${process.pid})`);
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
