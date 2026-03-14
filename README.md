# code_manage

A self-hosted developer dashboard for managing a portfolio of local software projects. Scans your filesystem, discovers projects across languages and frameworks, and provides a unified web interface for browsing, searching, and interacting with them.

## What It Does

- **Automatic project discovery** — scans a root directory tree and catalogs every project it finds, regardless of language (Node.js, Python, Rust, Go, etc.)
- **Status-based organization** — projects are grouped by filesystem location into categories: Active, Research, Tools, Crawlers, Icebox, and Archived
- **Suite grouping** — directories ending in `_suite` (e.g., `builder_suite/`) are treated as logical groups, and their child projects are tagged accordingly
- **Code quality grades** — integrates with `rcodegen` to display quality scores broken down by audit, test, fix, and refactor tasks
- **Bug tracking** — reads Markdown bug reports from `_bugs_open` and `_bugs_fixed` directories within each project
- **Full-text search** — searches across all project codebases using `ripgrep`
- **Activity timeline** — aggregates git commit history and displays a code velocity chart (lines added/removed per day)
- **Sandboxed terminal** — browser-based terminal with a whitelisted set of commands
- **Project actions** — open in VS Code, reveal in Finder, move between status categories, star/favorite, create new projects via `ralph` scaffolding
- **Documentation viewer/editor** — browse and edit Markdown docs within projects

## Architecture

**Filesystem as database.** There is no traditional database. All project state is derived from the directory structure, file contents, and a single `.code-manage.json` config file for metadata overrides (stars, custom names, notes).

**Scanner-first design.** The core engine (`lib/scanner.ts`) performs a full directory traversal on every API request. It uses bounded concurrency (8 workers via a Semaphore) to scan projects in parallel without overwhelming the OS.

**Directory-driven status.** A project's status is determined by which directory it lives in:

```
~/Desktop/_code/
├── my-project/              → active
├── builder_suite/
│   └── code_manage/         → active (suite: Builder)
├── _crawlers/               → crawlers
├── _research_and_demos/     → research
├── _tools/                  → tools
├── _icebox/                 → icebox
└── _old/                    → archived
```

Moving a project between statuses is done by physically renaming its directory.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | React 18, Tailwind CSS, Lucide icons |
| Charts | Recharts |
| Tables | TanStack React Table |
| Validation | Zod |
| Logging | Pino |
| Markdown | react-markdown, remark-gfm, react-syntax-highlighter, @uiw/react-md-editor |
| Chassis | `@ai8future/*` packages via `file:` protocol (errors, work, secval, logger, config, flagz, call, registry) |
| Concurrency | `@ai8future/work` — Semaphore-based bounded concurrency (workMap, workAll, workRace, workStream) |
| Testing | Vitest |
| Linting | ESLint (flat config) |

### External Dependencies (host system)

- **`rg`** (ripgrep) — full-text search
- **`git`** — commit history and velocity data
- **`code`** — VS Code CLI for "open in editor"
- **`ralph`** — project scaffolding CLI (optional, for new project creation)

## Getting Started

### Prerequisites

- Node.js 20+
- ripgrep (`brew install ripgrep`)
- git

### Install

```bash
npm install
```

### Configure

Set environment variables or use defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `CODE_BASE_PATH` | `/Users/cliff/Desktop/_code` | Root directory to scan for projects |
| `LOG_LEVEL` | `info` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `NODE_ENV` | `development` | Enables pretty-printed logs in dev |

### Run

```bash
# Development (port 7491)
npm run dev

# Production
npm run build
npm run start
```

### Test

```bash
npm run test          # Run once
npm run test:watch    # Watch mode
```

### Lint

```bash
npm run lint
```

## API Reference

### Projects

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/projects` | List all projects with counts per status. Query: `?status=active&search=term` |
| `GET` | `/api/projects/[slug]` | Get a single project by slug |
| `PATCH` | `/api/projects/[slug]` | Update metadata (star, status, custom name) |
| `POST` | `/api/projects/create` | Create a new project via `ralph` scaffolding |
| `GET` | `/api/projects/readme` | Read a project's README |
| `GET` | `/api/projects/docs` | List Markdown doc files in a project |
| `GET` | `/api/projects/docs/[filename]` | Read a doc file |
| `PUT` | `/api/projects/docs/[filename]` | Write/update a doc file |

### Actions

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/actions/open-editor` | Open a path in VS Code |
| `POST` | `/api/actions/open-finder` | Open a path in macOS Finder |
| `POST` | `/api/actions/move` | Move a project to a different status folder |

### Activity

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/activity/commits` | Recent commits across all projects. Query: `?limit=50` |
| `GET` | `/api/activity/velocity` | Daily lines added/removed. Query: `?days=30` |

### Other

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/search` | Full-text search via ripgrep. Query: `?q=term&limit=100` |
| `POST` | `/api/terminal` | Execute a whitelisted command in a project directory |
| `GET` | `/api/file` | Read a file within `CODE_BASE_PATH` |

## Security

- **Path traversal protection** — all file paths are canonicalized with `path.resolve()` and verified via `fs.realpath()` to prevent both encoded traversal and symlink escapes
- **JSON security validation** — request bodies are checked for prototype pollution keys (`__proto__`, `constructor`, etc.) and excessive nesting depth
- **Terminal sandboxing** — only whitelisted commands are allowed; dangerous sub-arguments are blocked (e.g., `node -e`, `npm exec`); `execFile()` is used instead of `exec()` to prevent shell injection
- **Output size limits** — git operations cap at 10MB, terminal at 2MB, search at 20MB
- **Process timeouts** — terminal commands timeout at 60s, project creation at 5 minutes
- **Log redaction** — sensitive fields (`password`, `token`, `secret`, `authorization`, `cookie`) are automatically redacted
- **RFC 9457 error responses** — all API errors return structured Problem Details; 5xx errors suppress internal details

## Project Detection

A directory is recognized as a project if it contains any of: `package.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Makefile`, `.git`, or `VERSION`.

Directories that are always skipped: `node_modules`, `.git`, `__pycache__`, `.next`, `dist`, `build`, `.obsidian`, `.stfolder`, `.pytest_cache`, `.codemachine`, `.claude`.

## Key Modules

| Module | Purpose |
|--------|---------|
| `lib/scanner.ts` | Core filesystem scanner — project discovery, tech stack detection, metadata gathering |
| `lib/types.ts` | All shared TypeScript interfaces |
| `lib/constants.ts` | Status/folder mapping that drives the organizational system |
| `lib/config.ts` | Read/write `.code-manage.json` with advisory file locking |
| `lib/env.ts` | Zod-validated environment configuration |
| `lib/logger.ts` | Pino structured logger with field redaction |
| `lib/git.ts` | Git subprocess utility with output size caps |
| `lib/ports.ts` | Deterministic port assignment from project name (MD5 hash) |
| `lib/schemas.ts` | Zod schemas for all API request validation |
| `lib/api/pathSecurity.ts` | Path traversal and symlink escape prevention |
| `lib/api/validate.ts` | Request body parsing with optional security validation |
| `lib/api/errors.ts` | Next.js error response adapters |
