# Changelog

All notable changes to this project will be documented in this file.

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
