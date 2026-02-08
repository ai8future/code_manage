// Adapted from @ai8future/errors v4 — unified error type with dual HTTP and gRPC status codes

/** gRPC status code names matching google.rpc.Code. */
export type GrpcCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'DEADLINE_EXCEEDED'
  | 'RESOURCE_EXHAUSTED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

/**
 * Unified error type with both HTTP and gRPC status codes.
 * Use factory functions (validationError, notFoundError, etc.) to create instances.
 */
export class ServiceError extends Error {
  readonly grpcCode: GrpcCode;
  readonly httpCode: number;
  readonly details: Map<string, string>;

  constructor(message: string, grpcCode: GrpcCode, httpCode: number) {
    super(message);
    Object.setPrototypeOf(this, ServiceError.prototype);
    this.name = 'ServiceError';
    this.grpcCode = grpcCode;
    this.httpCode = httpCode;
    this.details = new Map();
  }

  /** Fluent detail attachment. */
  withDetail(key: string, value: string): this {
    this.details.set(key, value);
    return this;
  }

  /** Convert to a plain object suitable for gRPC status. */
  grpcStatus(): { code: GrpcCode; message: string } {
    return { code: this.grpcCode, message: this.message };
  }

  /** Convert to RFC 9457 Problem Details format. */
  problemDetail(requestPath?: string): ProblemDetail {
    const pd: ProblemDetail = {
      type: TYPE_URIS[this.grpcCode] ?? TYPE_URIS.INTERNAL!,
      title: TITLES[this.grpcCode] ?? 'Error',
      status: this.httpCode,
      detail: this.message,
    };
    if (requestPath) pd.instance = requestPath;
    if (this.details.size > 0) {
      pd.extensions = Object.fromEntries(this.details);
    }
    return pd;
  }
}

// --- Factory constructors ---

/** Invalid input (400 / INVALID_ARGUMENT). */
export function validationError(msg: string): ServiceError {
  return new ServiceError(msg, 'INVALID_ARGUMENT', 400);
}

/** Missing resource (404 / NOT_FOUND). */
export function notFoundError(msg: string): ServiceError {
  return new ServiceError(msg, 'NOT_FOUND', 404);
}

/** Auth failure (401 / UNAUTHENTICATED). */
export function unauthorizedError(msg: string): ServiceError {
  return new ServiceError(msg, 'UNAUTHENTICATED', 401);
}

/** Deadline exceeded (504 / DEADLINE_EXCEEDED). */
export function timeoutError(msg: string): ServiceError {
  return new ServiceError(msg, 'DEADLINE_EXCEEDED', 504);
}

/** Rate limiting (429 / RESOURCE_EXHAUSTED). */
export function rateLimitError(msg: string): ServiceError {
  return new ServiceError(msg, 'RESOURCE_EXHAUSTED', 429);
}

/** Dependency failure (503 / UNAVAILABLE). */
export function dependencyError(msg: string): ServiceError {
  return new ServiceError(msg, 'UNAVAILABLE', 503);
}

/** Unexpected failure (500 / INTERNAL). */
export function internalError(msg: string): ServiceError {
  return new ServiceError(msg, 'INTERNAL', 500);
}

/** Conflict (409). Uses INVALID_ARGUMENT gRPC code since there is no ALREADY_EXISTS in our subset. */
export function conflictError(msg: string): ServiceError {
  return new ServiceError(msg, 'INVALID_ARGUMENT', 409);
}

/** Forbidden (403 / PERMISSION_DENIED). */
export function forbiddenError(msg: string): ServiceError {
  return new ServiceError(msg, 'PERMISSION_DENIED', 403);
}

// --- RFC 9457 Problem Details ---

/** Type URI map keyed by gRPC code. */
const TYPE_URIS: Record<string, string> = {
  INVALID_ARGUMENT: 'https://chassis.ai8future.com/errors/validation',
  NOT_FOUND: 'https://chassis.ai8future.com/errors/not-found',
  UNAUTHENTICATED: 'https://chassis.ai8future.com/errors/unauthorized',
  PERMISSION_DENIED: 'https://chassis.ai8future.com/errors/forbidden',
  DEADLINE_EXCEEDED: 'https://chassis.ai8future.com/errors/timeout',
  RESOURCE_EXHAUSTED: 'https://chassis.ai8future.com/errors/rate-limit',
  UNAVAILABLE: 'https://chassis.ai8future.com/errors/dependency',
  INTERNAL: 'https://chassis.ai8future.com/errors/internal',
};

const TITLES: Record<string, string> = {
  INVALID_ARGUMENT: 'Validation Error',
  NOT_FOUND: 'Not Found',
  UNAUTHENTICATED: 'Unauthorized',
  PERMISSION_DENIED: 'Forbidden',
  DEADLINE_EXCEEDED: 'Request Timeout',
  RESOURCE_EXHAUSTED: 'Rate Limit Exceeded',
  UNAVAILABLE: 'Service Unavailable',
  INTERNAL: 'Internal Server Error',
};

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  extensions?: Record<string, string>;
}

// --- HTTP Status → Problem Detail mapping ---

/** Maps HTTP status codes to RFC 9457 type URIs. */
export const HTTP_STATUS_TYPE_MAP: Record<number, string> = {
  400: TYPE_URIS.INVALID_ARGUMENT!,
  401: TYPE_URIS.UNAUTHENTICATED!,
  403: TYPE_URIS.PERMISSION_DENIED!,
  404: TYPE_URIS.NOT_FOUND!,
  408: TYPE_URIS.DEADLINE_EXCEEDED!,
  409: TYPE_URIS.INVALID_ARGUMENT!,
  413: TYPE_URIS.INVALID_ARGUMENT!,
  422: TYPE_URIS.INVALID_ARGUMENT!,
  429: TYPE_URIS.RESOURCE_EXHAUSTED!,
  500: TYPE_URIS.INTERNAL!,
  502: TYPE_URIS.UNAVAILABLE!,
  503: TYPE_URIS.UNAVAILABLE!,
  504: TYPE_URIS.DEADLINE_EXCEEDED!,
};

export const HTTP_STATUS_TITLE_MAP: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Validation Error',
  429: 'Rate Limit Exceeded',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** Resolve RFC 9457 type URI for an HTTP status code. */
export function typeUriForStatus(status: number): string {
  return HTTP_STATUS_TYPE_MAP[status] ?? TYPE_URIS.INTERNAL!;
}

/** Resolve RFC 9457 title for an HTTP status code. */
export function titleForStatus(status: number): string {
  return HTTP_STATUS_TITLE_MAP[status] ?? 'Error';
}

/**
 * Build a ProblemDetail from an HTTP status code and message.
 * Useful for error handlers that work with status codes rather than GrpcCode values.
 */
export function problemDetailForStatus(
  status: number,
  detail: string,
  instance?: string,
  extensions?: Record<string, string>,
): ProblemDetail {
  const pd: ProblemDetail = {
    type: typeUriForStatus(status),
    title: titleForStatus(status),
    status,
    detail,
  };
  if (instance) pd.instance = instance;
  if (extensions) pd.extensions = extensions;
  return pd;
}

// --- Helpers ---

/**
 * Converts any error to a ServiceError. If it's already one, returns it;
 * otherwise wraps it as an internal error.
 */
export function fromError(err: unknown): ServiceError {
  if (err instanceof ServiceError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return internalError(msg);
}
