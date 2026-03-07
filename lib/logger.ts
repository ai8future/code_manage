// Structured JSON logging via @ai8future/logger
import { createLogger as createChassisLogger } from '@ai8future/logger';
import { env } from './env';
import { trackRequestStart, trackRequestEnd } from './diagnostics';

const logger = createChassisLogger(env.logLevel);

export default logger;

/** Create a child logger scoped to an API route */
export function createRouteLogger(routeName: string) {
  return logger.child({ route: routeName });
}

/** Create a request-scoped logger that includes x-request-id */
export function createRequestLogger(routeName: string, request: Request) {
  const requestId = request.headers.get('x-request-id') ?? undefined;
  return logger.child({ route: routeName, requestId });
}

/** Create a tracked request logger that registers with crash diagnostics.
 *  Returns { log, done } — call done() when the request completes. */
export function createTrackedRequestLogger(routeName: string, request: Request) {
  const requestId = request.headers.get('x-request-id') ?? undefined;
  const log = logger.child({ route: routeName, requestId });
  const key = trackRequestStart(routeName, requestId);

  const done = () => {
    trackRequestEnd(key);
  };

  return { log, done };
}
