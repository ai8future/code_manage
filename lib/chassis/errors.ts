// Adapted from @ai8future/errors — unified error type with dual HTTP and gRPC status codes

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

/**
 * Converts any error to a ServiceError. If it's already one, returns it;
 * otherwise wraps it as an internal error.
 */
export function fromError(err: unknown): ServiceError {
  if (err instanceof ServiceError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return internalError(msg);
}
