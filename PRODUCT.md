# PRODUCT.md -- Code Manager

## What Is Code Manager?

Code Manager is a self-hosted developer dashboard that serves as a **command center for a portfolio of local software projects**. It exists because a developer who maintains dozens (or hundreds) of projects across multiple languages and frameworks needs a single place to see what they have, what state each project is in, how healthy the code is, and how active development has been -- without relying on any external SaaS, cloud database, or third-party service.

The product scans a root directory tree on the local filesystem, discovers every project it can find, and presents a unified web UI to browse, search, organize, inspect, and take action on them.

It is one product within the **Builder suite** (it lives in `builder_suite/`), the set of internal tools that support building and operating the broader portfolio of services.

---

## Who Does It Serve?

Code Manager is a **single-operator, self-hosted tool**. Its primary consumer is the developer (or the AI coding agents working on their behalf) who owns the `~/Desktop/_code` tree and needs portfolio-level visibility and control over it. It is not a multi-tenant SaaS and has no authentication layer or user model -- it assumes a trusted, local, single-user context and binds to a fixed dev port (`10467`).

Secondary consumers are the **other services in the operational ecosystem**: the `@ai8future/registry` records the service and its `invalidate-cache` command for operational tooling, and the `@ai8future/kafkakit` event bus publishes `ai8.builder.code.scan.completed` events that downstream services can subscribe to. Both integrations degrade silently when their backing infrastructure (the registry daemon, Kafka) is absent, so the dashboard remains fully usable as a standalone local app.

---

## Why Does This Product Exist? (Business Goals)

### 1. Unified Portfolio Visibility

When a developer accumulates many projects -- active services, internal tools, research prototypes, crawlers, archived experiments -- it becomes impossible to remember what exists, where it lives, what tech it uses, or when it was last touched. Code Manager solves this by automatically discovering projects and aggregating their metadata into a single dashboard. The developer never has to manually register or catalog anything.

### 2. Lifecycle and Status Management

Projects have lifecycles. Something starts as active work, then might be shelved to an "icebox," or archived entirely, or reclassified as a tool or research project. Code Manager maps this lifecycle directly onto the filesystem's folder structure: moving a project to the `_icebox` folder marks it as iceboxed, moving it to `_old` archives it. The product provides a UI action to move projects between statuses, which physically relocates the directory. This means the filesystem itself is always the source of truth -- there is no database to get out of sync.

### 3. Code Quality Oversight Across All Projects

Code Manager integrates with an external tool called `rcodegen` that performs automated code quality assessments (audits, test coverage, bug fixes, refactoring). Each project can have a `_rcodegen` directory containing graded reports. Code Manager reads these grades and surfaces them in two places:

- **Per-project detail pages**, showing the latest quality score broken down by task type (audit, test, fix, refactor) and by which AI tool performed the analysis (Claude, Gemini, Codex).
- **A portfolio-wide Code Health dashboard section**, showing the average grade across all projects, which projects are below the quality threshold (score < 60), which have never been analyzed, and which are top performers.

The business value: a developer managing many projects can instantly see which codebases need attention and which are healthy, without having to run assessments manually or remember which projects were last evaluated.

### 4. Development Activity Tracking

Code Manager aggregates git commit history across all projects and presents:

- A **code velocity chart** showing daily lines added and removed across the entire portfolio, with configurable time ranges (7, 30, or 90 days).
- A **recent commits feed** showing the latest commits from all projects, with links back to each project, author information, and line change stats.

This gives the developer a macro-level view of their productivity and which projects are receiving the most attention.

### 5. Cross-Project Full-Text Search

Using `ripgrep` under the hood, Code Manager provides a global search that spans all project codebases simultaneously. Results are grouped by project, shown with file paths and line numbers, and linked back to project detail pages. This solves the problem of "I wrote something like X somewhere -- which project was it in?" Common non-source files (lock files, node_modules, build artifacts) are automatically excluded.

### 6. Bug Tracking Via Filesystem Convention

Projects that follow a convention of storing Markdown-formatted bug reports in `_bugs_open/` and `_bugs_fixed/` directories get automatic bug tracking in the UI. Code Manager reads these files, parses their titles and dates from filenames (format: `YYYY-MM-DD-description.md`), and presents open vs. fixed bug counts with expandable lists. Bug reports can be viewed in a rendered Markdown modal directly in the browser or opened in VS Code.

This is intentionally lightweight -- no database, no issue tracker service. The bugs are just files that AI coding agents or developers drop into the right folder. Code Manager makes them visible and navigable.

### 7. Documentation Browsing and Editing

Each project's Markdown documents (excluding standard files like README, CHANGELOG, LICENSE) are surfaced in a docs panel. Documents from two locations are merged:

- **Project-local docs** -- Markdown files in the project directory itself.
- **Vault docs** -- Markdown files from a centralized `__VAULT/{project_name}/` directory, supporting a pattern where cross-project documentation is stored in a shared vault.

Documents support front-matter (YAML headers) for metadata like title, description, and date. Documents can be read with a rendered Markdown preview, edited with a built-in Markdown editor, or opened in VS Code.

### 8. Project Scaffolding

New projects can be created through the UI via a "New Project" modal. The user provides a name, selects a category (Active, Tools, Research, Crawlers), and writes a natural language design description. This description is passed to an external CLI tool called `ralph` which scaffolds the project. The generated project is placed in the correct directory based on its category and immediately appears in the dashboard.

### 9. Sandboxed Browser Terminal

Each project has an optional terminal panel that runs whitelisted commands in the project's directory. The terminal supports a controlled set of commands -- `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `git`, `npm`, `npx`, `yarn`, `pnpm`, `node`, `grep`, `find`, `echo`, `date`, `which` -- with specific dangerous sub-arguments blocked: `node -e/--eval/-p/--print/-r/--require`, `npm exec/x/init/create/pkg`, `npx --yes/-y/--package`, and `yarn dlx` / `pnpm dlx`. The terminal uses `execFile` rather than `exec` to prevent shell injection. This allows quick command execution without leaving the browser, while preventing arbitrary code execution.

### 10. IDE and OS Integration

Projects can be opened in VS Code or revealed in Finder directly from the UI. The project's filesystem path can be copied to clipboard. These are one-click actions designed to minimize context switching between the dashboard and development tools.

---

## Project Organizational Model

The product's core organizational concept is **directory-driven status**. A project's status is determined entirely by which folder it resides in:

| Filesystem Location | Status | Description |
|---|---|---|
| `~/Desktop/_code/{project}` | Active | Main, currently-developed projects |
| `~/Desktop/_code/{name}_suite/{project}` | Active (in suite) | Projects grouped under a logical suite |
| `~/Desktop/_code/_crawlers/{project}` | Crawlers | Web scrapers and data collectors |
| `~/Desktop/_code/_research_and_demos/{project}` | Research | Experimental and prototype work |
| `~/Desktop/_code/_tools/{project}` | Tools | Developer utilities |
| `~/Desktop/_code/_icebox/{project}` | Icebox | Temporarily shelved projects |
| `~/Desktop/_code/_old/{project}` | Archived | Retired or superseded projects |

**Suites** are a grouping mechanism. Any directory ending in `_suite` (e.g., `builder_suite`, `app_email4ai_suite`) is treated as a logical group. Projects within a suite are tagged with the suite name (e.g., "Builder") and maintain their suite affiliation when moved between statuses.

**Moving a project** between statuses is a physical filesystem operation -- `fs.rename()`. This means git history, file contents, and all project state travel with the directory. When a project is returned to "active" from icebox/archived, it goes back to its original suite if it belonged to one.

---

## Project Detection and Metadata Extraction

A directory is recognized as a project if it contains any of these indicator files: `package.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Makefile`, `.git`, or `VERSION`. Projects in status folders (icebox, archived, etc.) do not require indicators -- every child directory is treated as a project.

For each discovered project, the scanner extracts:

- **Tech stack** -- detected from package.json dependencies (Next.js, React, Vue, Svelte, Express, Fastify, Electron, Tailwind, TypeScript), pyproject.toml/requirements.txt (FastAPI, Django, Flask), Cargo.toml (Rust), go.mod (Go). Techs are prioritized and deduplicated.
- **Description** -- pulled from package.json `description` field, or the first content paragraph of the README.
- **Version** -- read from `VERSION` file, `package.json` version field, `pyproject.toml`, or `Cargo.toml`.
- **Chassis version** -- read from `VERSION.chassis` (tracks which version of the shared chassis framework is in use).
- **Git info** -- current branch, remote URL, whether git is initialized. Reads directly from `.git/HEAD` and `.git/config` files rather than spawning processes, which is faster for mass scanning.
- **Scripts** -- npm scripts from package.json (run, test, build, etc.).
- **Dependencies** -- production dependencies from package.json.
- **Bug counts** -- open and fixed bug reports from `_bugs_open/` and `_bugs_fixed/`.
- **Code quality grades** -- from `_rcodegen/.grades.json` or by parsing rcodegen report files.

---

## User-Configurable Metadata

Beyond auto-detected metadata, users can customize projects via a single `.code-manage.json` config file in the root scan directory. This supports:

- **Starred/favorited projects** -- starred projects sort to the top of listings.
- **Custom names** -- override the directory name with a display name.
- **Custom descriptions** -- override the auto-extracted description.
- **Tags** -- user-defined tags for categorization.
- **Notes** -- free-text notes attached to a project.
- **Status overrides** -- override the directory-derived status.

The config file uses advisory file locking (via `proper-lockfile`) to prevent corruption when multiple processes or concurrent requests try to write simultaneously.

---

## Performance and Caching Strategy

The scanner performs a full directory traversal using bounded concurrency (3 parallel workers via a Semaphore from `@ai8future/work`). Scan results are cached for 10 seconds with request coalescing -- if 5 API calls hit simultaneously, only one filesystem scan runs and all 5 share the result.

Git commit data is cached for 30 seconds, velocity data for 60 seconds. These caches use FIFO eviction with bounded size to prevent unbounded memory growth.

---

## Security Model

The product enforces several security boundaries despite being self-hosted:

- **Path traversal prevention** -- all user-supplied file paths are canonicalized with `path.resolve()` and verified via `fs.realpath()` to defeat both `../` encoding attacks and symlink escapes. Every path must resolve to within `CODE_BASE_PATH`.
- **JSON security validation** -- request bodies are checked for prototype pollution keys (`__proto__`, `constructor`, `constructor.prototype`) and excessive nesting depth via the `@ai8future/secval` package.
- **Terminal sandboxing** -- whitelisted commands only, with blocked dangerous arguments. Uses `execFile()` (no shell) to prevent injection. Output capped at 2MB, 60-second timeout.
- **Output size limits** -- git operations capped at 5MB, search at 5MB. Prevents memory exhaustion from malicious or accidentally large outputs.
- **Security headers** -- X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy applied to all responses.
- **Log redaction** -- sensitive fields automatically scrubbed from structured logs.
- **RFC 9457 error responses** -- all API errors return structured Problem Details format; 5xx errors suppress internal details.

---

## Operational Infrastructure

Code Manager integrates with a broader operational ecosystem:

- **Chassis framework** (`@ai8future/chassis`) -- provides version gating, port assignment, and shared service patterns.
- **Service registry** (`@ai8future/registry`) -- registers the service, its ports, status, and custom commands (like `invalidate-cache`) for operational visibility.
- **Lifecycle management** (`@ai8future/lifecycle`) -- handles SIGTERM/SIGINT, coordinates graceful shutdown, manages heartbeat and command polling.
- **Event bus** (`@ai8future/kafkakit`) -- publishes `ai8.builder.code.scan.completed` events when scans finish, for integration with other services. Degrades gracefully if Kafka is not configured.
- **Observability** (`@ai8future/otel`) -- optional OpenTelemetry integration for distributed tracing.
- **Feature flags** (`@ai8future/flagz`) -- environment-variable-based feature flags with `FLAG_` prefix.
- **Health endpoint** (`/api/health`) -- returns healthy/unhealthy status based on process memory (threshold: 1GB RSS).
- **Crash diagnostics** -- sync-safe crash logging to `.next/crash.log`, unhandled rejection/exception handlers, periodic health snapshots (60s), inflight request tracking, and before-exit detection to catch silent process death.

---

## UI Structure

The web interface is organized around a collapsible sidebar with these sections:

| Page | Purpose |
|---|---|
| **Dashboard** (`/`) | Main view with project table (excluding icebox/archived) and Code Health overview |
| **Activity** (`/activity`) | Code velocity chart and recent commits feed across all projects |
| **Search** (`/search`) | Global full-text search across all codebases |
| **Agents** (`/agents`) | Placeholder for automated job/agent configuration and monitoring |
| **Config** (`/config`) | Placeholder for per-codebase configuration (ports, custom names, status overrides) |
| **Status pages** (`/active`, `/crawlers`, `/research`, `/tools`, `/icebox`, `/archived`) | Filtered project listings per status category |
| **Project detail** (`/project/{slug}`) | Full project view with header, info cards, bugs, code quality, docs, README, and terminal |
| **Settings** (`/settings`) | Sidebar preferences, default status, terminal height, manual rescan trigger |

The sidebar displays each status category with a project count badge and an expandable inline project list for quick navigation. A "New Project" button launches the scaffolding modal.

---

## Summary of Business Logic

1. **Discovery is automatic** -- no manual registration; if it is on disk, it appears in the dashboard.
2. **The filesystem is the database** -- project status, bug reports, docs, quality grades, and versions are all derived from directory structure and file contents. The only "database" is a single JSON config file for user preferences.
3. **Status is physical location** -- moving a project between categories is a directory rename, not a metadata update. This keeps the filesystem and the UI permanently in sync.
4. **Quality oversight is aggregated** -- code health grades from external analysis tools are surfaced at both the per-project and portfolio level, with attention-routing (highlighting projects below threshold).
5. **Activity is cross-project** -- commit history and velocity are aggregated across the entire portfolio, not siloed per project.
6. **Actions bridge to desktop tools** -- one-click open in VS Code, reveal in Finder, sandboxed terminal, and AI-powered project scaffolding reduce context switching.
7. **Security is defense-in-depth** -- even as a local tool, path traversal, JSON injection, shell injection, and resource exhaustion are all guarded against.
8. **Operations are built in** -- health checks, crash logging, event publishing, service registry, and observability are not afterthoughts but integral parts of the product.

---

## How to Think About Code Changes

When editing this codebase, hold these constraints firmly:

1. **The filesystem is the source of truth; do not introduce a database.** Project status, bugs, docs, grades, versions, and git info are all derived from disk on every scan. The only persisted state is the single `.code-manage.json` file for user preferences (stars, custom names, status overrides, tags, notes). Adding a real database would break the core promise that the dashboard always reflects on-disk reality with nothing to sync.

2. **Status is location; moving is a rename.** Never model a status change as a pure metadata write. The `move` action physically `fs.rename()`s the directory and preserves suite affiliation (a project moved back to "active" returns to its original `*_suite` folder). The `.code-manage.json` `status` field is an override, not the primary signal.

3. **Every path crossing a process boundary must be validated.** All user-supplied paths route through `lib/api/pathSecurity.ts` (`validatePath`), which `path.resolve()`s and `fs.realpath()`s to confine them within `CODE_BASE_PATH` and defeat symlink escapes. Mutating bodies use `parseSecureBody` (prototype-pollution + depth guard via `@ai8future/secval`); the terminal endpoint is the one deliberate exception (it uses plain `parseBody` plus its own command whitelist).

4. **Never spawn a shell.** All subprocess work (`git`, `rg`, `ralph`, editor/Finder openers) uses `spawn`/`execFile` with array args -- never `exec` with an interpolated string. New external-tool integrations must follow this pattern and add output-size caps and timeouts.

5. **Respect the caching layer.** Reads go through `getCachedProjects()` (10s TTL with request coalescing); any mutation must call `invalidateProjectCache()` so the next read re-scans. Git/velocity caches are separate, bounded, and FIFO-evicted.

6. **Chassis is mandatory and version-gated.** `instrumentation.ts` and `lib/env.ts` call `requireMajor(11)` before anything else. Environment config flows through `@ai8future/config` + Zod (`lib/env.ts`); ports come from `@ai8future/chassis`; errors are RFC 9457 Problem Details from `@ai8future/errors`. Do not hand-roll replacements for these.

**What belongs here vs. a sibling repo:** This product is purely an *observer and light orchestrator* of the local code tree. The actual code-quality analysis lives in `rcodegen`; project scaffolding lives in `ralph`; the shared framework packages live in `chassis_suite/chassis-ts`. Code Manager only *reads the outputs* of `rcodegen` (the `_rcodegen/` directory) and *shells out to* `ralph` -- it must not absorb their logic. Bug reports and docs are authored elsewhere (by agents/developers dropping files); Code Manager only surfaces them.

---

## Deployment Model and Scale

Code Manager is a **Next.js 16 (App Router) application run locally**, not a deployed cloud service. It is started with `npm run dev` (webpack, port **10467**) or `npm run build && npm run start`. The `--webpack` flag is required: the chassis packages are ESM-only and symlinked from outside the project root via the `file:` protocol, which Turbopack cannot resolve.

Startup wiring lives in `instrumentation.ts` (Next.js instrumentation hook, Node.js runtime only): it version-gates chassis, optionally initializes OpenTelemetry (when `OTEL_ENDPOINT` is set) and the kafkakit event bus (when `KAFKAKIT_BOOTSTRAP_SERVERS` is set), installs crash handlers writing sync logs to `.next/crash.log`, starts a 60-second health monitor (warns above 512MB RSS), registers the HTTP port and the `invalidate-cache` command with `@ai8future/registry`, and runs `@ai8future/lifecycle`'s `run()` to coordinate SIGTERM/SIGINT graceful shutdown.

**Scale characteristics.** The workload is a single user against a single filesystem tree, so scale is bounded by the size of `~/Desktop/_code`. The scanner uses bounded concurrency (3 workers via `@ai8future/work`) for both project discovery and per-project git stats, plus short-lived caches (projects 10s, commits ~30s, velocity 60s) to keep a busy dashboard from triggering redundant full traversals. The `/api/health` endpoint reports unhealthy (HTTP 503) above **1024MB RSS**. There is no horizontal scaling story and none is intended.

---

## Current State and Status

**Version:** 1.5.11 (`VERSION`). The product is built and in active use; the changelog tracks an ongoing cadence of dependency upgrades (currently Next.js 16.2.9, chassis major 11), ESLint cleanups, and stability fixes (notably guards against silent process death and the Turbopack/ESM resolution issue).

**Built and working:**
- Project discovery, suite grouping, and directory-driven status.
- Per-project detail (tech stack, version, git, scripts, dependencies, bugs, rcodegen grades, docs, README, terminal).
- Portfolio Code Health overview, cross-project activity (velocity + commits), and ripgrep full-text search.
- Status pages (`/active`, `/crawlers`, `/research`, `/tools`, `/icebox`, `/archived`), Settings, and all documented API routes including `/api/health`.
- Actions: star/favorite, move-between-status, open-in-VS-Code, reveal-in-Finder, project scaffolding via `ralph`.
- Operational integrations: chassis version gating, registry, lifecycle, kafkakit event bus, optional OTel, feature flags (`@ai8future/flagz`, `FLAG_` prefix), crash diagnostics.

**Planned / placeholder (UI stub only, no backing logic yet):**
- **Agents** (`/agents`) -- intended for configuring and monitoring automated jobs across codebases.
- **Config** (`/config`) -- intended for per-codebase settings (ports, custom names, status overrides) surfaced as a dedicated page; today these overrides are only editable via `.code-manage.json` and Settings.
