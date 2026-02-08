// Next.js error response helpers using chassis error patterns
import { NextResponse } from 'next/server';
import {
  ServiceError,
  fromError,
  type ProblemDetail,
} from '@/lib/chassis/errors';

/**
 * Convert a ServiceError to a NextResponse with RFC 9457 Problem Details.
 * For 5xx errors, the detail message is suppressed to prevent leaking internals.
 */
export function errorResponse(err: ServiceError, requestPath?: string): NextResponse {
  const problem = err.problemDetail(requestPath);

  // Suppress internal details on 5xx (chassis httpkit pattern)
  if (err.httpCode >= 500) {
    problem.detail = 'Internal Server Error';
  }

  return NextResponse.json(problem, {
    status: err.httpCode,
    headers: { 'content-type': 'application/problem+json' },
  });
}

/**
 * Catch-all handler for route try/catch blocks.
 * Converts any error to a ServiceError and returns an RFC 9457 response.
 */
export function handleRouteError(error: unknown, requestPath?: string): NextResponse {
  const svcErr = fromError(error);
  return errorResponse(svcErr, requestPath);
}

/**
 * Convert a PathValidationResult failure to an error response.
 */
export function pathErrorResponse(error: string, status: number, requestPath?: string): NextResponse {
  const problem: ProblemDetail = {
    type: status === 403
      ? 'https://chassis.ai8future.com/errors/unauthorized'
      : 'https://chassis.ai8future.com/errors/not-found',
    title: status === 403 ? 'Forbidden' : 'Not Found',
    status,
    detail: error,
  };
  if (requestPath) problem.instance = requestPath;

  return NextResponse.json(problem, {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}
