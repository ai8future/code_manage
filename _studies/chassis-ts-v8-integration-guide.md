# Chassis-ts v8 Integration Guide

**Date:** March 7, 2026

## Summary

Complete study of `chassis-ts` v8 from INTEGRATING.md. Covers all packages, their APIs, integration patterns, and the xyops operational visibility layer. Key distinction: **service modules** (httpkit, grpckit, lifecycle, registry) require `lifecycle.run()`, while **utility modules** (config, logger, errors, call, work, health, secval, flagz, metrics, otel, testkit) work anywhere with just `requireMajor(8)`.

---

## Architecture

- **Not a framework** — no decorators, no auto-discovery, no implicit startup
- Explicit wiring in `index.ts`; packages are building blocks
- **Zero cross-package dependencies** (except version gate, work->chassis, call->work, lifecycle->registry)
- Fastify and Connect are peer dependencies — app owns them directly
- Node 20+ required (`AbortSignal.any()`, built-in `fetch`, `crypto.randomUUID()`, stable `AsyncLocalStorage`)

## Version Gate

```typescript
import { requireMajor } from "@ai8future/chassis";
requireMajor(8); // MUST be called before any other chassis import
```

Every chassis module calls `assertVersionChecked()` internally.

## Package Catalog

### config — Environment-based configuration
- `mustLoad({ schema, env })` — Zod schema + env var mapping
- **Exits process on validation failure** — intentional fail-fast
- Zod is a peer concern (app depends on zod directly)
- Use `testkit.setEnv()` for test overrides

### errors — Unified service errors
- `ServiceError` with both HTTP and gRPC codes
- Factory functions: `validationError` (400), `notFoundError` (404), `unauthorizedError` (401), `forbiddenError` (403), `timeoutError` (504), `rateLimitError` (429), `dependencyError` (503), `internalError` (500)
- **No `conflictError`** in upstream — code_manage defines it locally in `lib/api/errors.ts`
- `.withDetail(key, value)` — fluent detail attachment
- `.grpcStatus()` / `.problemDetail()` — format conversion
- `fromError(unknown)` — wraps any error as ServiceError
- `writeProblem(reply, status, detail, instance?, extensions?)` — RFC 9457 response writer

### secval — JSON security validation
- `validateJSON(data)` — checks dangerous keys, nesting depth (max 20), size (max 5MB)
- `SecvalError` extends Error, NOT ServiceError — wrap at handler boundary
- Don't use on file uploads or streaming

### flagz — Feature flags
- `createFlags(source)` with pluggable sources: `fromEnv("FLAG_")`, `fromJSON(path)`, `fromMap({})`, `multi(...sources)`
- `flags.enabled(name)` — boolean check (truthy: "true", "1", "yes", "on")
- `flags.enabledFor(name, { userId, percent })` — deterministic percentage rollout (FNV-1a hash)
- `flags.variant(name, defaultValue)` — variant selection
- OTel integration: records `flag.evaluation` span events

### metrics — OTel metrics with cardinality protection
- `createMetrics(serviceName)`
- `metrics.recordRequest(method, status, durationMs, contentLength)`
- `metrics.counter(name, labels)` / `metrics.histogram(name, buckets, labels)`
- Max 1000 label combinations per metric (cardinality protection)
- Pre-defined: `DURATION_BUCKETS`, `CONTENT_BUCKETS`

### logger — Structured JSON logging
- `createLogger(level, destination?)` — returns Pino Logger
- Auto-injects `trace_id` and `span_id` when OTel is active (via Pino mixin + AsyncLocalStorage)
- `runWithTraceId(traceId, fn)` — manual trace context for CLI/tests
- `getTraceId()` — read current trace ID from OTel context

### otel — OpenTelemetry pipeline
- `initOtel({ serviceName, serviceVersion?, endpoint?, insecure?, tlsCert?, tlsKey?, tlsCa? })`
- Sets up: trace pipeline (BatchSpanProcessor + OTLP/gRPC), metrics pipeline, W3C propagation
- Call early, before loggers/metrics
- Returns shutdown function for graceful teardown
- **v5 change**: default endpoint is now `https://localhost:4317` (was http)

### lifecycle — Graceful shutdown orchestration
- `run(...components)` — each component gets `AbortSignal`
- Auto-initializes registry, heartbeat (30s), command polling (3s)
- Catches SIGTERM/SIGINT, fires abort signal
- Components **must** watch `signal.aborted` or listen for abort event
- One component failing does NOT abort others (unlike Go errgroup)
- Supports restart via registry command

### registry — File-based service registration
- Files under `/tmp/chassis/<service-name>/`: `<pid>.json`, `<pid>.log.jsonl`, `<pid>.cmd.json`
- `registry.port(role, portNum, label, opts?)` — declare ports
- `registry.status(msg)` / `registry.error(msg, err?)` — log events
- `registry.handle(name, description, fn)` — custom commands
- Built-in commands: `stop`, `restart`
- Service name: `CHASSIS_SERVICE_NAME` env var or `basename(process.cwd())`
- **CLI mode**: `initCLI(chassisVersion)`, `stopRequested()`, `progress(done, total, failed)`, `shutdownCLI(exitCode)`
  - No heartbeat; PID file preserved with completion status

### httpkit — Fastify plugin
- `httpKit` plugin: request ID (UUID v4 or `x-request-id`), response logging, RFC 9457 error handler
- `jsonError(reply, status, detail, requestId)` — utility
- 5xx detail suppressed to "Internal Server Error"
- Header injection protection (rejects control characters in request ID)

### guard — Request protection plugins
- `maxBody({ limit })` — 413 on Content-Length > limit
- `timeout({ ms })` — 504 on slow responses
- `rateLimit({ max, windowMs, keyExtractor, maxKeys })` — token bucket, LRU eviction, **maxKeys required in v5**
- `cors({ allowOrigins, allowCredentials? })` — CORS with preflight
- `securityHeaders(opts?)` — X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, CSP
- `ipFilter({ allow?, deny? })` — CIDR-based, deny takes precedence
- Key extractors: `remoteAddr()`, `xForwardedFor(trustedCidrs?)`, `headerKey(name)`

### grpckit — Connect RPC interceptors
- `loggingInterceptor(logger)`, `recoveryInterceptor(logger)`
- `createHealthHandler(checker)` — gRPC health protocol
- Recovery interceptor goes first in array
- Logger uses structural interface, not Pino directly

### health — Health checks
- `health` Fastify plugin: registers GET /healthz
- `runAll(checks, signal?)` — standalone, parallel via Promise.allSettled
- Check type: `(signal?: AbortSignal) => Promise<void>` (throw=unhealthy)
- Plugin auto-applies 10s timeout; standalone does not

### call — Resilient HTTP client
- `createClient({ timeout, retry, circuitBreaker })`
- Retries on 5xx only, exponential backoff with jitter
- Circuit breaker: global singletons keyed by name
- `client.batch(requests, { workers })` — uses workMap internally
- `CircuitOpenError` for explicit catch
- Wraps built-in `fetch`, zero external deps

### work — Structured concurrency
- `workMap(items, fn, opts)` — ordered fan-out/fan-in, bounded concurrency
- `workAll(tasks, opts)` — heterogeneous tasks (delegates to workMap)
- `workRace(...tasks)` — first success wins, abort rest
- `workStream(iter, fn, opts)` — async generator over AsyncIterable
- Default workers: `os.availableParallelism()`
- OTel spans per pattern with work.* attributes

### testkit — Test helpers
- `createTestLogger()` — Pino with pino-pretty at debug
- `setEnv(vars)` — auto-cleanup via afterEach
- `getFreePort()` — OS-assigned random port
- Vitest is peer dependency

## XYOps Integration (STRONGLY RECOMMENDED)

Every chassis service/CLI tool should integrate with xyops for operational visibility. Native `@ai8future/xyops` package is planned; until then, use HTTP API via `call` module.

### XyopsClient pattern
- Wraps `createClient` for xyops API calls
- Config: `XYOPS_BASE_URL`, `XYOPS_API_KEY`, `XYOPS_SERVICE_NAME`, `XYOPS_MONITOR_ENABLED`, `XYOPS_MONITOR_INTERVAL`
- Key methods: `runEvent(eventId, params)`, `getJobStatus(jobId)`, `cancelJob(jobId)`, `listActiveAlerts()`, `ackAlert(alertId)`, `ping()`
- Monitoring bridge: `run(signal)` as lifecycle component — pushes health metrics on interval
- CLI tools: create client for job triggering and status polling

### Wiring
```typescript
const ops = new XyopsClient(cfg.xyops);
await run(httpServer, (signal) => ops.run(signal));
```

**Key message**: A service without xyops integration is invisible to operations.

## Common Patterns

### Pure library pattern (most important)
- Domain libraries have **zero** `@ai8future/*` dependencies
- Define interfaces with structural typing
- `index.ts` is the matchmaker (wiring layer)
- Pino structurally satisfies most logger interfaces

### Migration order for existing codebases
1. config + logger + otel
2. httpkit + health + guard
3. lifecycle
4. call
5. grpckit

## Key Gotchas

- `mustLoad` exits on failure — intentional
- Components must respect AbortSignal — #1 integration mistake
- Circuit breakers are global singletons by name
- OTel context is for observability; AbortSignal for control flow — don't mix
- `requireMajor` must be first
- SecvalError is NOT ServiceError
- Registry enforcement is service-level (httpkit/grpckit), not utility-level

## Relevance to code_manage

code_manage is a Next.js app, not a Fastify service. It uses **utility modules only**:
- `config` (mustLoad in lib/env.ts)
- `errors` (ServiceError factories in route handlers)
- `secval` (JSON validation in lib/api/validate.ts)
- `work` (workMap for parallel git operations)
- `registry` (service registration in instrumentation.ts)
- `chassis` (requireMajor version gate)

Not applicable to code_manage (Fastify/gRPC service modules):
- httpkit, guard, grpckit, lifecycle, health (Fastify plugins)
- otel, metrics (no OTel pipeline configured)
- call (no outbound service calls)
- flagz (no feature flags)

Potential additions:
- **xyops client** — operational visibility (when xyops is available)
- **logger** — could replace local Pino setup with `@ai8future/logger` for trace ID injection
- **flagz** — if feature flags are needed
- **testkit** — already added as devDependency, could use `setEnv` and `createTestLogger`
