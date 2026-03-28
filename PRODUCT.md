# PRODUCT.md -- Code Manager

## What Is Code Manager?

Code Manager is a self-hosted developer dashboard that serves as a **command center for a portfolio of local software projects**. It exists because a developer who maintains dozens (or hundreds) of projects across multiple languages and frameworks needs a single place to see what they have, what state each project is in, how healthy the code is, and how active development has been -- without relying on any external SaaS, cloud database, or third-party service.

The product scans a root directory tree on the local filesystem, discovers every project it can find, and presents a unified web UI to browse, search, organize, inspect, and take action on them.

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

Each project has an optional terminal panel that runs whitelisted commands in the project's directory. The terminal supports a controlled set of commands (`ls`, `git`, `npm`, `node`, `grep`, `find`, etc.) with specific dangerous sub-arguments blocked (e.g., `node -e`, `npm exec`, `npx --yes`). The terminal uses `execFile` rather than `exec` to prevent shell injection. This allows quick command execution without leaving the browser, while preventing arbitrary code execution.

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
- **XYOps monitoring** -- optional background health metric push (RSS, heap, uptime) to an external operational visibility platform.
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
