# Chassis-TS Integration Proposal for Code Manage

## Executive Summary

Code Manage is a Next.js dashboard app that scans and manages local codebases. It already follows several chassis-ts principles (Zod config validation, Pino logging, structured error handling), but does so with ad-hoc implementations. This proposal identifies where chassis-ts packages can replace, improve, or extend the existing patterns.

**Important context**: Code Manage is a Next.js application, not a standalone Node.js service. It does not use Fastify, gRPC/Connect, or run as a long-lived process with SIGTERM handling. This means several chassis-ts packages (httpkit, guard, grpckit, lifecycle, otel, call) have no direct applicability. The integration focuses on the packages that provide clear value in this context.

---

## Compatibility Assessment

### Directly Applicable Packages

| Package | Relevance | Replaces |
|---------|-----------|----------|
| `@ai8future/config` | **High** | `lib/env.ts` (manual Zod env parsing) |
| `@ai8future/errors` | **High** | Ad-hoc `{ error: string }` JSON responses across all 14 API routes |
| `@ai8future/logger` | **Medium** | `lib/logger.ts` (custom Pino setup) |
| `@ai8future/secval` | **Medium** | No equivalent exists; adds defense-in-depth to POST routes |
| `@ai8future/work` | **Medium** | `Promise.all` patterns in scanner and git operations |
| `@ai8future/testkit` | **Medium** | No test helpers exist currently |

### Not Applicable (Next.js Incompatible)

| Package | Reason |
|---------|--------|
| `@ai8future/httpkit` | Fastify plugin; Next.js uses its own HTTP layer |
| `@ai8future/guard` | Fastify plugins (maxBody, timeout, rateLimit); Next.js middleware or edge functions serve this role |
| `@ai8future/grpckit` | No gRPC/Connect usage |
| `@ai8future/lifecycle` | Next.js manages its own process lifecycle |
| `@ai8future/otel` | Sets up Node.js OTel pipeline; would need Next.js-specific instrumentation instead |
| `@ai8future/call` | No outbound HTTP calls to other services; all data comes from filesystem |
| `@ai8future/health` | Fastify plugin; could use `runAll` standalone but there are no external dependencies to check |
| `@ai8future/metrics` | OTel metrics without an OTel pipeline running |
| `@ai8future/chassis` | Version gate only needed if using multiple chassis packages in a service context |

---

## Proposed Changes

### Phase 1: Config (`@ai8future/config`)

**Current state** (`lib/env.ts`):
```typescript
const EnvSchema = z.object({
  CODE_BASE_PATH: z.string().min(1).default('/Users/cliff/Desktop/_code'),
  LOG_LEVEL: z.enum([...]).default('info'),
  NODE_ENV: z.enum([...]).default('development'),
});
export const env = EnvSchema.parse({
  CODE_BASE_PATH: process.env.CODE_BASE_PATH ?? undefined,
  LOG_LEVEL: process.env.LOG_LEVEL ?? undefined,
  NODE_ENV: process.env.NODE_ENV ?? undefined,
});
```

**Problem**: Manual env-to-field mapping duplicated inline. The `?? undefined` pattern for each field is boilerplate.

**Proposed change**: Replace with `mustLoad`:
```typescript
import { mustLoad } from '@ai8future/config';
import { z } from 'zod';

const EnvSchema = z.object({
  codeBasePath: z.string().min(1).default('/Users/cliff/Desktop/_code'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = mustLoad({
  schema: EnvSchema,
  env: {
    codeBasePath: 'CODE_BASE_PATH',
    logLevel: 'LOG_LEVEL',
    nodeEnv: 'NODE_ENV',
  },
});
```

**Files changed**: `lib/env.ts`
**Impact**: Low risk. Same behavior, cleaner code. All consumers import `env` from the same place.

**Note**: `mustLoad` calls `process.exit(1)` on failure. This is safe for Next.js API routes since they run in a Node.js process, and config errors should crash at startup anyway (which is the current behavior via Zod's `.parse()` throwing).

---

### Phase 2: Errors (`@ai8future/errors`)

**Current state**: Every API route returns ad-hoc error shapes:
```typescript
// 14 routes, each with their own error patterns:
return NextResponse.json({ error: 'Project not found' }, { status: 404 });
return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
```

**Problems**:
1. No consistent error shape for clients to parse
2. Internal error messages sometimes leak in 500 responses
3. No RFC 9457 Problem Details format
4. Client-side error handling must guess at the response shape

**Proposed change**: Create `lib/api/errors.ts` that wraps chassis errors for Next.js:
```typescript
import { ServiceError, fromError, notFoundError, validationError, internalError } from '@ai8future/errors';
import { NextResponse } from 'next/server';

/** Convert a ServiceError to a NextResponse with RFC 9457 Problem Details */
export function errorResponse(err: ServiceError, requestPath?: string): NextResponse {
  const problem = err.problemDetail(requestPath);
  return NextResponse.json(problem, {
    status: err.httpCode,
    headers: { 'content-type': 'application/problem+json' },
  });
}

/** Catch-all handler for route try/catch blocks */
export function handleRouteError(error: unknown, requestPath?: string): NextResponse {
  const svcErr = fromError(error);
  return errorResponse(svcErr, requestPath);
}
```

**Usage in routes** (example: `app/api/projects/[slug]/route.ts`):
```typescript
import { notFoundError } from '@ai8future/errors';
import { errorResponse, handleRouteError } from '@/lib/api/errors';

export async function GET(request, { params }) {
  try {
    const project = projects.find(p => p.slug === slug);
    if (!project) {
      return errorResponse(notFoundError('Project not found'));
    }
    return NextResponse.json(project);
  } catch (error) {
    log.error({ err: error }, 'Error fetching project');
    return handleRouteError(error);
  }
}
```

**Files changed**:
- New: `lib/api/errors.ts`
- Modified: All 14 API route files (mechanical replacement of `NextResponse.json({ error })` with `errorResponse()`)

**Impact**: Medium. Consistent error shape across all endpoints. Clients can rely on RFC 9457 format. 5xx errors no longer risk leaking internal details.

---

### Phase 3: Logger (`@ai8future/logger`)

**Current state** (`lib/logger.ts`):
```typescript
const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', ... } } : {}),
});
export function createRouteLogger(routeName: string) {
  return logger.child({ route: routeName });
}
export function createRequestLogger(routeName: string, request: Request) {
  const requestId = request.headers.get('x-request-id') ?? undefined;
  return logger.child({ route: routeName, requestId });
}
```

**Assessment**: The current logger is already well-structured. The chassis logger adds:
- Automatic sensitive field redaction (password, token, secret, authorization, cookie)
- ISO timestamp formatting
- OTel trace ID injection (not useful without OTel pipeline)

**Proposed change**: Replace the Pino setup with `createLogger`, keep the route/request helper functions:
```typescript
import { createLogger } from '@ai8future/logger';
import { env } from './env';

const logger = createLogger(env.logLevel);
export default logger;

export function createRouteLogger(routeName: string) {
  return logger.child({ route: routeName });
}

export function createRequestLogger(routeName: string, request: Request) {
  const requestId = request.headers.get('x-request-id') ?? undefined;
  return logger.child({ route: routeName, requestId });
}
```

**Files changed**: `lib/logger.ts`
**Impact**: Low. Gains automatic field redaction. Loses pretty-printing in dev (chassis logger doesn't include it by default). Could pass a pino-pretty destination stream as second arg to preserve dev experience.

**Recommendation**: Optional adoption. The current logger is fine. Adopt this only if you want the redaction feature or plan to add OTel later.

---

### Phase 4: Security Validation (`@ai8future/secval`)

**Current state**: No JSON payload security validation. POST bodies are validated for shape (Zod) but not for dangerous keys like `__proto__`, `constructor`, etc.

**Proposed change**: Add `validateJSON` to the `parseBody` helper:
```typescript
import { validateJSON, SecvalError } from '@ai8future/secval';
import { validationError } from '@ai8future/errors';

export function parseBody<T>(schema: ZodType<T>, data: unknown): ParseSuccess<T> | ParseFailure {
  // Security check on raw JSON string (if available)
  if (typeof data === 'string') {
    try {
      validateJSON(data);
    } catch (err) {
      if (err instanceof SecvalError) {
        return {
          success: false,
          response: errorResponse(validationError(err.message)),
        };
      }
    }
  }
  // ... existing Zod validation
}
```

**Or** add it as middleware in routes that accept user-provided JSON:
```typescript
// In POST routes
const rawBody = await request.text();
try { validateJSON(rawBody); } catch (e) { ... }
const body = JSON.parse(rawBody);
```

**Files changed**: `lib/api/validate.ts` or individual POST routes
**Impact**: Low risk, defense-in-depth. Prevents prototype pollution attacks through request bodies.

---

### Phase 5: Structured Concurrency (`@ai8future/work`)

**Current state**: The scanner uses sequential loops for project scanning and `Promise.all` for parallel git operations without concurrency bounds:
- `scanAllProjects()` iterates directories sequentially
- Git operations spawn processes without bounded concurrency
- No structured error handling for partial failures

**Proposed change**: Use `workMap` for bounded concurrent scanning:
```typescript
import { workMap } from '@ai8future/work';

// In scanAllProjects():
const results = await workMap(
  projectDirs,
  async (dir, { signal }) => scanSingleProject(dir, signal),
  { workers: 8 },  // Bound concurrent fs/git operations
);

// results is Result<Project>[] - partial failures don't crash the whole scan
const projects = results
  .filter(r => r.value)
  .map(r => r.value!);
```

**Where this helps**:
- `scanAllProjects()` — Scan multiple projects concurrently with bounds
- `app/api/activity/commits/route.ts` — Fetching git logs across multiple projects
- `app/api/activity/velocity/route.ts` — Fetching git numstat across multiple projects

**Files changed**: `lib/scanner.ts`, `app/api/activity/commits/route.ts`, `app/api/activity/velocity/route.ts`
**Impact**: Medium. Improves scan performance with safety. Requires `requireMajor(4)` call somewhere at app startup.

**Caveat**: Using `@ai8future/work` requires the `@ai8future/chassis` version gate (`requireMajor(4)`). This is the only chassis package that enforces the gate internally. For a Next.js app, you'd call `requireMajor(4)` in a top-level module that loads before routes.

---

### Phase 6: Test Kit (`@ai8future/testkit`)

**Current state**: Vitest is configured but test helpers are minimal. No standardized way to set up test environments.

**Proposed change**: Use testkit utilities in test files:
```typescript
import { createTestLogger, setEnv, getFreePort } from '@ai8future/testkit';

describe('scanner', () => {
  setEnv({ CODE_BASE_PATH: '/tmp/test-projects' });

  it('scans projects', async () => {
    const logger = createTestLogger();
    // ... test with proper logging capture
  });
});
```

**Files changed**: `tests/` directory
**Impact**: Low. Convenience improvement for testing.

---

## Changes NOT Recommended

### Don't Add: httpkit, guard, grpckit, lifecycle, otel, metrics, health, call

These packages are designed for standalone Node.js services using Fastify and/or Connect RPC. Code Manage is a Next.js app where:

- **HTTP handling** is managed by Next.js Route Handlers, not Fastify
- **Rate limiting / body limits / timeouts** would be handled by Next.js middleware or edge config
- **Process lifecycle** is managed by Next.js
- **No outbound service calls** exist (all data is local filesystem)
- **No gRPC** is used
- **OTel** would need Next.js-specific instrumentation, not the Node.js pipeline that `@ai8future/otel` sets up

Forcing these packages in would create an impedance mismatch. The chassis philosophy is explicit composition — use what fits, don't cargo-cult the rest.

---

## Implementation Order

| Phase | Package | Effort | Risk | Value |
|-------|---------|--------|------|-------|
| 1 | config | Small | Low | Cleaner env handling |
| 2 | errors | Medium | Low | Consistent error responses, RFC 9457 |
| 3 | logger | Small | Low | Field redaction (optional) |
| 4 | secval | Small | Low | Prototype pollution protection |
| 5 | work | Medium | Medium | Bounded concurrency, partial failure handling |
| 6 | testkit | Small | Low | Better test infrastructure |

**Recommended approach**: Phases 1, 2, and 4 together (config + errors + secval), then Phase 5 (work) separately since it requires the version gate mechanism.

---

## Additional Improvements Inspired by Chassis Patterns

Even without installing chassis packages, the codebase would benefit from adopting these chassis-ts patterns:

### 1. Pure Library Pattern
Currently, `lib/scanner.ts` directly imports `lib/constants.ts` and `lib/logger.ts`. Following the chassis pure library pattern, the scanner should accept its dependencies (logger, basePath) as constructor/function parameters rather than importing them directly. This makes the scanner testable in isolation.

### 2. Request ID Propagation
The `createRequestLogger` function exists but is unused in most routes — they use `createRouteLogger` instead. Consistently using request-scoped loggers with `x-request-id` across all routes would improve traceability.

### 3. Error Boundary Discipline
Following the chassis pattern of converting all errors at handler boundaries (using `fromError`), every route's catch block should use a single `handleRouteError()` function rather than hand-crafting error responses.

### 4. Query String Stripping in Logs
Chassis httpkit strips query strings from logged URLs to prevent secret leakage. The same pattern should be applied in the existing route loggers — some routes log full request URLs including query parameters.

---

## Package Installation

```bash
# Core packages for Next.js context
pnpm add @ai8future/config @ai8future/errors @ai8future/secval @ai8future/work @ai8future/chassis

# Optional
pnpm add @ai8future/logger

# Dev
pnpm add -D @ai8future/testkit
```

Note: `@ai8future/work` depends on `@ai8future/chassis` for the version gate. Using `work` means you must call `requireMajor(4)` at startup.
