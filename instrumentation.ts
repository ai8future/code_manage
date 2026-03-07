// Next.js instrumentation hook — runs once at server startup
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only install in Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    // Version gate — must be called before any other chassis module
    const { requireMajor } = await import('@ai8future/chassis');
    requireMajor(8);

    const { crashLogger, installCrashHandlers, startHealthMonitor, logStartup } =
      await import('@/lib/diagnostics');
    const registry = await import('@ai8future/registry');
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    logStartup();
    installCrashHandlers(crashLogger);
    startHealthMonitor(crashLogger);

    // Initialize chassis registry — writes PID.json to /tmp/chassis/<service>/
    let chassisVersion = 'unknown';
    try {
      chassisVersion = readFileSync(join(process.cwd(), 'VERSION.chassis'), 'utf-8').trim();
    } catch { /* use default */ }

    const ac = new AbortController();
    registry.port(0, 7491, 'Next.js dev server');
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
    }

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

    crashLogger.error(
      {
        err,
        request: { path: request.path, method: request.method },
        context,
        snapshot: takeHealthSnapshot(),
      },
      `Request error in ${context.routePath}: ${err.message}`,
    );
  }
}
