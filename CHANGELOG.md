# Changelog

## [1.4.13] - 2026-03-07

### Fixed
- Restore pino-pretty output in development mode after chassis logger migration

### Agent
- Claude:Opus 4.6

## [1.4.12] - 2026-03-07

### Added
- `@ai8future/logger`: replace local Pino setup with chassis logger (broader redaction, OTel trace ID injection)
- `@ai8future/flagz`: feature flags via `fromEnv("FLAG_")` source in `lib/flags.ts`
- `@ai8future/call`: resilient HTTP client for xyops integration
- `lib/xyops.ts`: XyopsClient with monitoring bridge, job management, and alert APIs
- Xyops config env vars: `XYOPS_BASE_URL`, `XYOPS_API_KEY`, `XYOPS_SERVICE_NAME`, `XYOPS_MONITOR_ENABLED`, `XYOPS_MONITOR_INTERVAL`
- Xyops monitoring bridge wired into `instrumentation.ts` (activates when base URL and API key are set)

### Removed
- `tests/helpers.ts`: dead code (no test files imported it)

### Agent
- Claude:Opus 4.6

## [1.4.11] - 2026-03-07

### Changed
- Remove stale "Adapted from @ai8future" comments in `lib/ports.ts` and `lib/logger.ts`

### Agent
- Claude:Opus 4.6

## [1.4.10] - 2026-03-07

### Changed
- Upgrade chassis integration from v6.0.8 vendored adapters to v8.0.0 `@ai8future/*` packages
- Replace all `@/lib/chassis/*` imports with direct `@ai8future/*` package imports (errors, secval, config, work, registry)
- Add `requireMajor(8)` version gate in `instrumentation.ts` and `lib/env.ts`
- Configure webpack `import` condition for ESM-only chassis packages in `next.config.mjs`
- Build uses `--webpack` flag (Turbopack doesn't support symlinked ESM externals)
- Add vitest setup file with chassis version gate for test compatibility

### Removed
- Delete vendored `lib/chassis/` directory (config.ts, errors.ts, secval.ts, work.ts, registry.ts) — replaced by `@ai8future/*` packages

### Added
- `conflictError()` factory in `lib/api/errors.ts` (not present in upstream `@ai8future/errors`)

### Agent
- Claude:Opus 4.6

## [1.4.9] - 2026-03-07

### Added
- `lib/chassis/registry.ts`: vendored chassis registry module — file-based service registration at `/tmp/chassis/code_manage/`, with PID.json, JSONL event log, heartbeat (30s), command polling (3s), and built-in stop/restart commands
- Registry integration in `instrumentation.ts`: initializes on server startup, declares HTTP port, writes startup event, cleans up on shutdown

### Agent
- Claude:Opus 4.6

## [1.4.8] - 2026-03-07

### Changed
- Upgrade chassis integration from v5.0.0 to v6.0.8
- `lib/chassis/secval.ts`: updated dangerous keys to match v6 (added `__definegetter__`, `__definesetter__`, `__lookupgetter__`, `__lookupsetter__`; removed `include`, `import`, `system`, `command` to avoid false positives on business-domain JSON); added 5MB `MAX_INPUT_SIZE` guard; stopped leaking key names in error messages
- `lib/chassis/work.ts`: added GC cleanup in `workStream` (null out yielded results to allow garbage collection)
- Version headers updated to `v6.0.8` across all chassis modules

### Agent
- Claude:Opus 4.6

## [1.4.7] - 2026-03-07

### Fixed
- Silent process death caused by `healthTimer.unref()` — if the HTTP server socket closed for any reason, the unref'd timer wouldn't keep the event loop alive, causing the process to exit silently with no error, no signal, and no crash log entry
- Added `beforeExit` and `exit` handlers to catch event loop drain and log the cause before death

### Agent
- Claude:Opus 4.6

## [1.4.6] - 2026-03-07
- Sync uncommitted changes

All notable changes to this project will be documented in this file.

## [1.4.5] - 2026-03-07

### Changed
- Upgraded all chassis modules from v5 to v6 (`errors`, `secval`, `work`, `config`)
- `writeProblem` in `lib/chassis/errors.ts` now takes `(reply, status, detail, instance?, extensions?)` matching v6 API (raw status/detail instead of ServiceError)
- `lib/ports.ts` rewritten to use djb2 hashing per v6 spec (was MD5); added `port(serviceName, offset)` API and `PORT_HTTP`, `PORT_GRPC`, `PORT_METRICS` offset constants

### Agent
- Claude:Opus 4.6

## [1.4.4] - 2026-02-17

### Added
- `lib/diagnostics.ts`: crash-safe file logger (sync JSON to `.next/crash.log`), health snapshots (RSS, heap, uptime, active handles, inflight requests), inflight request tracking, crash handlers (`uncaughtException`/`unhandledRejection` with full context dump), periodic health monitor (60s interval, warns at RSS > 512MB), graceful shutdown logging
- `instrumentation.ts`: Next.js server initialization hook — installs crash handlers and health monitor at startup, exports `onRequestError` for request-level error capture
- `app/api/health/route.ts`: `GET /api/health` endpoint returning live health snapshot and inflight request list with durations
- `createTrackedRequestLogger()` in `lib/logger.ts` — returns `{ log, done }` that registers/deregisters with crash diagnostics so inflight requests appear in crash dumps

### Fixed
- `velocityCache` memory leak in `app/api/activity/velocity/route.ts` — added FIFO eviction cap at 10 entries

### Changed
- `app/api/activity/velocity/route.ts`: adopted `createTrackedRequestLogger` for request lifecycle tracking
- `app/api/projects/route.ts`: adopted `createTrackedRequestLogger` as reference implementation

### Agent
- Claude:Opus 4.6

## [1.4.3] - 2026-02-17

### Fixed
- Dev server crashing due to concurrent resource exhaustion on dashboard load
- Multiple components each triggering independent full filesystem scans (5+ simultaneous scans)
- Unbounded git child process spawning (up to 40+ concurrent git processes)
- O(n^2) string concatenation in git output buffering causing memory spikes
- No timeout on git operations allowing processes to hang indefinitely
- Search route accumulating up to 20MB of unbounded string output
- Activity routes re-scanning all projects on every request

### Added
- `lib/scan-cache.ts`: server-side scan cache with 10s TTL and request coalescing — concurrent requests share a single scan
- `lib/hooks/useProjects.ts`: client-side shared hook with module-level cache — all components share one `/api/projects` fetch
- Per-process 30s timeout on all git operations (`spawnGit`)
- 30s cache on commits route, 60s cache on velocity route
- Array-based `Buffer` accumulation in git.ts and search route (replaces string concatenation)

### Changed
- Scanner worker concurrency reduced from 8 to 3 (prevents process exhaustion)
- Activity route workers reduced from 8 to 3 with 15s per-project timeout
- Git max output reduced from 10MB to 5MB; search max output from 20MB to 5MB
- `SidebarWrapper`, `CodeHealthSection`, `ProjectTable`, `ProjectGrid`, `SidebarProjectList`, `SettingsPanel` all now use shared `useProjects` hook instead of independent fetches
- `/api/projects`, `/api/projects/[slug]` now use `getCachedProjects()` instead of raw `scanAllProjects()`
- Activity routes (`commits`, `velocity`) now use cached project list and gracefully skip failed/timed-out git operations
- stderr accumulation capped at 4KB in git.ts and search route to prevent memory growth

### Agent
- Claude:Opus 4.6

## [1.4.2] - 2026-02-17

### Changed
- Modernize Zod usage to v4-native patterns across all schema and validation code
- `lib/chassis/config.ts`: import `z` as value (not type-only) from `'zod'`; clean up error formatting
- `lib/api/validate.ts`: replace try/catch + `instanceof ZodError` with `safeParse` (v4 preferred); drop `ZodError` import
- `lib/schemas.ts`: replace all deprecated `message` string shorthand with v4 `{ error: '...' }` param
- `lib/api/createOpenActionRoute.ts`: same `message` → `{ error }` migration
- `lib/env.ts`: same `message` → `{ error }` migration

### Agent
- Claude:Opus 4.6

## [1.4.1] - 2026-02-17

### Changed
- Replace boilerplate Next.js README with comprehensive project documentation covering architecture, API reference, security model, configuration, and all key modules

### Agent
- Claude:Opus 4.6

## [1.4.0] - 2026-02-08

### Changed
- Upgrade chassis integration to align with chassis-ts v5.0.0
- `lib/chassis/errors.ts`: `TYPE_URIS` and `TITLES` now typed as `Record<GrpcCode, string>` for compile-time safety; removed `!` non-null assertions; un-exported `HTTP_STATUS_TYPE_MAP` and `HTTP_STATUS_TITLE_MAP`; added `writeProblem()` function and `ProblemReply` interface
- `lib/chassis/secval.ts`: added `"command"` to `DANGEROUS_KEYS`; `validateJSON` now returns `void` (callers use `JSON.parse` separately)
- `lib/chassis/work.ts`: `Semaphore` constructor now validates `limit >= 1`; `workStream` uses index-based iteration for O(1) yields instead of `shift()`
- `lib/chassis/config.ts`: header updated to v5 (no functional changes)
- `lib/api/validate.ts`: updated `parseSecureBody` for `validateJSON` void return
- `app/api/terminal/route.ts`: switched from `parseSecureBody` to `parseBody` (terminal route intentionally accepts `command` field which is now a secval dangerous key)

### Agent
- Claude:Opus 4.6

## [1.3.0] - 2026-02-08

### Changed
- Upgrade chassis integration to align with chassis-ts v4.0.3
- `lib/chassis/errors.ts`: add `grpcStatus()` method, HTTP status→Problem Detail helpers (`typeUriForStatus`, `titleForStatus`, `problemDetailForStatus`), `HTTP_STATUS_TYPE_MAP` and `HTTP_STATUS_TITLE_MAP` constants
- `lib/chassis/work.ts`: major rewrite — Semaphore-based concurrency, `AbortSignal` context, `workRace`, `workAll`, `workStream`, input validation via `resolveWorkers`
- `lib/api/errors.ts`: refactored `pathErrorResponse` to use `typeUriForStatus`/`titleForStatus` instead of hardcoded strings
- Activity route handlers updated for v4 `workMap` signature `(item, { signal })`

### Added
- `VERSION.chassis` file tracking chassis-ts alignment version (4.0.3)

### Agent
- Claude:Opus 4.6

## [1.2.0] - 2026-02-07

### Added
- Chassis-ts pattern integration: errors, config, secval, work modules in `lib/chassis/`

### Agent
- Claude:Opus 4.6

## [1.1.0] - 2026-02-05

### Added
- Suite directory support: scanner discovers projects inside `*_suite` directories (e.g., `builder_suite/code_manage`)
  - Suite badge shown on project cards and sidebar entries
  - Suite name in project detail breadcrumbs
  - Slug collision handling when projects in different suites share a name
  - Move route preserves suite affiliation when changing project status
- Activity page with commit history and velocity APIs
- Search page with full-text project search API
- Config page for app settings
- Agents page
- Project creation API and new project modal
- Docs card with docs listing/viewing API
- Markdown editor component with syntax highlighting
- Structured logging with pino (`lib/logger.ts`)
- Zod-based request validation (`lib/schemas.ts`, `lib/api/validate.ts`)
- Path security middleware (`lib/api/pathSecurity.ts`)
- Environment config with Zod validation (`lib/env.ts`)
- Git utilities for commit history (`lib/git.ts`)
- Port utilities (`lib/ports.ts`)
- Test helpers and new test suites for env, schemas, pathSecurity

### Changed
- Migrated ESLint config from `.eslintrc.json` to flat config (`eslint.config.mjs`)
- Sidebar project lists now show starred projects first
- Star/unstar toggle added to sidebar and project cards
- Project status types expanded with `research` and `tools` categories

### Fixed
- Path security test updated for new `builder_suite/` directory structure

### Agent
- Claude:Opus 4.6

## [1.0.6] - 2026-01-28

### Refactored
- Extract shared utilities to eliminate code duplication
  - `lib/hooks/useClickOutside.ts` - Reusable click-outside detection hook
  - `lib/hooks/useProjectActions.ts` - Centralized project actions (open editor, finder, copy path)
  - `lib/utils/grades.ts` - Grade color/background utilities
  - `lib/utils/dates.ts` - Date formatting utilities (relative and short formats)
- Update ActionsMenu, ProjectCard, ProjectGrid, CodeHealthSection, and CodeQualityCard to use shared utilities
- Add barrel exports for hooks and utils

### Agent
- Claude:Opus 4.5

## [1.0.5] - 2026-01-25

### Added
- Syntax highlighting for code blocks in README preview and bug modals
- Uses Prism with oneDark theme for colorful, readable code display

## [1.0.4] - 2026-01-24

### Security
- Fix command injection vulnerability in open-editor and open-finder APIs
  - Changed from exec() to execFile() to prevent shell injection
  - Added path validation with path.resolve() to prevent traversal
- Fix path traversal vulnerability in file API
  - Now uses path.resolve() before checking path prefix

### Fixed
- Add missing 'crawlers' status to move API
- Fix double filesystem scan in projects API (performance improvement)
- Add status parameter validation in projects API
- Add crawlers to ProjectCounts interfaces in SidebarWrapper and ProjectGrid

## [1.0.3] - 2026-01-24

### Added
- Bug file preview modal with rendered Markdown
- Click on bug to see formatted content in popup
- "Open in VS Code" button in modal header
- File API endpoint for reading file contents
- @tailwindcss/typography for prose styling

## [1.0.2] - 2026-01-24

### Added
- New "Crawlers" status category for crawler projects in _crawlers folder
- Crawlers section in sidebar (above Icebox) with Bug icon

## [1.0.1] - 2026-01-24

### Fixed
- CodeHealthSection now correctly extracts projects array from API response

## [1.0.0] - 2026-01-24

### Added
- Initial release of Code Management App
- Collapsible sidebar with Navigation Rail/Drawer pattern
- Project scanner detecting tech stack from package.json, pyproject.toml, Cargo.toml, go.mod
- Project cards with search/filter, tech badges, git info, version display
- Project detail view with info cards, README preview, bug tracking
- rcodegen integration: grade badges on cards, CodeQualityCard with task breakdown
- Code Health Dashboard section showing grades overview and projects needing attention
- Settings page foundation
- Terminal panel foundation
- API routes for projects, actions (open editor/finder, move), and terminal
