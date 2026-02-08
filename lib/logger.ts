// Adapted from @ai8future/logger — structured JSON logging with sensitive field redaction
import pino from 'pino';
import { env } from './env';

const logger = pino({
  level: env.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password', 'token', 'secret', 'authorization', 'cookie',
      '*.password', '*.token', '*.secret', '*.key',
    ],
    censor: '[Redacted]',
  },
  ...(env.nodeEnv === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

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
