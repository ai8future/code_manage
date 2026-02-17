// Next.js instrumentation hook — runs once at server startup
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only install in Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    const { crashLogger, installCrashHandlers, startHealthMonitor, logStartup } =
      await import('@/lib/diagnostics');

    logStartup();
    installCrashHandlers(crashLogger);
    startHealthMonitor(crashLogger);
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
