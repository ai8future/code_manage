Date Created: 2026-02-17T23:45:00-06:00
TOTAL_SCORE: 68/100

# Code Manage — Refactor Audit Report

**Agent:** Claude:Opus 4.6
**Codebase Version:** 1.4.3
**Total Source Files Analyzed:** ~50 (lib, components, API routes, tests)
**Total Lines of Code:** ~6,500 (lib: ~1,250, components: ~3,880, API routes: ~1,340)

---

## Executive Summary

code_manage is a well-structured Next.js 16 application with strong security practices (RFC 9457 errors, path traversal protection, prototype pollution checks, structured logging). The architecture has a clear separation between API routes, business logic in `lib/`, and UI components. However, the codebase has accumulated significant duplication — particularly in markdown rendering (3 copies), process spawning (3 copies), star toggling (3 copies), and slug generation (4 copies). Several inconsistencies across components (error handling, modal patterns, status coverage) suggest organic growth without periodic consolidation. The score of 68/100 reflects a codebase that is functionally sound and secure but would benefit meaningfully from extracting shared utilities and establishing consistent UI primitives.

---

## Scoring Breakdown

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Code Duplication | 25% | 14/25 | Multiple high-severity duplications across all layers |
| Code Quality | 20% | 14/20 | Strong error model; some silent error swallowing and dead UI |
| Maintainability | 20% | 14/20 | scanner.ts monolith; good separation elsewhere |
| Consistency | 15% | 9/15 | Inconsistent error handling, modals, dropdowns, status coverage |
| Test Coverage | 10% | 8/10 | 8 test files covering critical paths; missing component tests |
| Architecture | 10% | 9/10 | Clean layering; good factory patterns (createOpenActionRoute) |
| **Total** | **100%** | **68/100** | |

---

## HIGH Priority Findings

### H1. ReactMarkdown Configuration Duplicated Verbatim in 3 Files

**Files:**
- `components/project/BugsCard.tsx` (lines ~91-152)
- `components/project/DocsCard.tsx` (lines ~124-187)
- `components/project/ReadmePreview.tsx` (lines ~71-147)

The exact same `<ReactMarkdown>` component configuration — including every custom renderer for `table`, `thead`, `tbody`, `tr`, `th`, `td`, `code`, and `pre` — is copy-pasted into three separate files with zero variation. Each imports the same dependencies (`ReactMarkdown`, `remarkGfm`, `SyntaxHighlighter`, `oneDark`).

**Recommendation:** Extract a shared `components/shared/MarkdownRenderer.tsx` that encapsulates the full configuration. Each call site becomes a single `<MarkdownRenderer content={content} />` call.

---

### H2. Child Process Spawn Pattern Duplicated in 3 Places

**Files:**
- `lib/git.ts` lines 28-86 (`spawnGit` — the reference implementation)
- `app/api/search/route.ts` lines 66-122 (`rg` invocation — 57 lines inline)
- `app/api/projects/create/route.ts` lines 59-102 (`ralph` invocation — 44 lines inline)

All three implement the identical structure: settle-flag one-shot closure, array-based chunk buffering, stderr capping at 4096 bytes, `SIGKILL` timeout with `clearTimeout` on error event, and exit-code checking.

**Recommendation:** Extract `lib/process.ts` with a generic `spawnProcess(command, args, options)` function. `spawnGit` becomes a thin wrapper. The search and create routes replace ~50 lines each with a 3-line call.

---

### H3. Slug Normalization Duplicated in 4 Locations

**Files:**
- `lib/scanner.ts` line 541-543 (scanProject)
- `lib/scanner.ts` lines 601-602 (slug collision — existing project)
- `lib/scanner.ts` lines 607-608 (slug collision — new project)
- `app/api/search/route.ts` lines 147-150 (search result processing)

All four use the identical chain: `.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`.

Critically, the search route generates slugs independently of the scanner's deduplication logic. For suite-namespaced projects (which get a `suitename--projectname` prefix), search results will produce mismatched `projectSlug` values that won't link to the actual project.

**Recommendation:** Extract `toSlug(name: string): string` to `lib/utils/slugs.ts`. Address the search route's slug divergence for suite projects.

---

### H4. `handleToggleStar` Duplicated in 3 Components

**Files:**
- `components/dashboard/ProjectGrid.tsx` lines 46-58
- `components/dashboard/ProjectTable.tsx` lines 59-71
- `components/sidebar/SidebarProjectList.tsx` lines 43-58 (silently swallows errors)

Each implements its own fetch to `PATCH /api/projects/[slug]`, with inconsistent error handling (two log with `console.error`, one silently ignores). Meanwhile, `useProjectActions` already exists and uses proper toast feedback for errors.

**Recommendation:** Add `toggleStar(project)` to `lib/hooks/useProjectActions.ts`. All three call sites gain consistent toast-based error feedback.

---

### H5. `scanner.ts` Is a 657-Line Monolith

**File:** `lib/scanner.ts`

This single file mixes four distinct responsibilities:
- Lines 40-64: Generic filesystem utilities (`fileExists`, `readJsonFile`, `readTextFile`)
- Lines 66-295: Project metadata extraction (tech stack, description, git, version)
- Lines 297-466: Bug and rcodegen directory scanning
- Lines 468-657: Directory traversal and orchestration

**Recommendation:** Split into `lib/scanner/fs.ts`, `lib/scanner/project.ts`, `lib/scanner/quality.ts`, `lib/scanner/index.ts`. Each module gets a clear, independently testable surface area.

---

### H6. `docs/route.ts` Bypasses All Standard Infrastructure

**File:** `app/api/projects/docs/route.ts`

This is the only API route that:
1. Returns a malformed error response (`{ docs: [], detail: '...' }` with status 500) instead of using `handleRouteError()` — missing required RFC 9457 fields (`type`, `title`, `status`)
2. Reimplements path validation inline (lines 57-62) instead of using `validatePath()` from `pathSecurity.ts`, with subtly different behavior (falls back to `resolvedPath` when `realpath` fails)
3. Has no `createRequestLogger` call, so errors are invisible in logs

**Recommendation:** Align with the pattern used by every other route: add structured logging, use `validatePath()`, and use `handleRouteError()` in the catch block.

---

## MEDIUM Priority Findings

### M1. BugModal and DocModal Are Structurally Identical

**Files:** `components/project/BugsCard.tsx`, `components/project/DocsCard.tsx`

Both modals share identical boilerplate: `fixed inset-0 z-50` backdrop with `backdrop-blur-sm`, same modal width/height constraints, same header layout (icon + title + close button), same loading spinner (`Loader2 animate-spin`), same `fetch('/api/file?...')` pattern.

**Recommendation:** Extract a shared `FilePreviewModal` component accepting `title`, `loading`, `error`, `content`, and `headerActions` props.

---

### M2. `open-editor` Fetch Call Duplicated in 3 Components (Bypassing Hook)

**Files:**
- `components/project/BugsCard.tsx` lines 170-178
- `components/project/DocsCard.tsx` lines 218-230
- `components/project/CodeQualityCard.tsx` lines 33-45

All three manually write the `POST /api/actions/open-editor` fetch call. `useProjectActions` already wraps this exact call. These components should use the hook instead.

---

### M3. `writeConfig()` Is Exported But Not Lock-Safe

**File:** `lib/config.ts` lines 68-71

`writeConfig` is exported publicly, bypassing the `withConfigLock` wrapper. Internally it's always called under the lock, but any external caller can invoke it unprotected, creating a race condition. It should be unexported.

---

### M4. Silent Error Swallowing in Scanner

**File:** `lib/scanner.ts` lines 305-330, 391-425

`scanBugs` and `scanRcodegen` catch all exceptions with `// Directory doesn't exist` comments, but `fs.readdir` can also throw `EACCES` or `EIO`. Real failures are silently ignored. The catches should check `(err as NodeJS.ErrnoException).code === 'ENOENT'` and at minimum log unexpected errors.

---

### M5. `useProjects.refresh()` Does Not Clear Error State

**File:** `lib/hooks/useProjects.ts` lines 103-121

When `refresh()` is called after a failed fetch, `setError(null)` is never called. The result is `loading: true` and `error: "An error occurred"` are simultaneously true, potentially rendering both a spinner and an error message.

---

### M6. `useProjectActions` Discards Server Error Detail

**File:** `lib/hooks/useProjectActions.ts` lines 14, 29

```ts
if (!res.ok) throw new Error('Failed to open in editor');
```

The server responds with RFC 9457 Problem Detail JSON including a human-readable `detail` field. The hook throws a hardcoded string without reading the response body. The toast always shows the same generic message regardless of actual error type.

---

### M7. `window.location.reload()` Instead of Data Refresh

**File:** `components/sidebar/Sidebar.tsx` line 206

Uses a hard page reload after successful project creation. The comment itself says "Could trigger a refresh of the project list here." `useProjects` already has a `refresh()` method. Hard reload destroys scroll position and causes full re-render.

---

### M8. `alert()` Used for Error Reporting

**File:** `components/actions/ActionsMenu.tsx` lines 71, 74

Uses `alert()` for error feedback, which is jarring, blocks the thread, and is inconsistent with the Toast system used everywhere else.

---

### M9. Non-Functional `terminalHeight` Setting

**File:** `components/settings/SettingsPanel.tsx` lines 107-129

Displays and accepts a `terminalHeight` value but never persists it. `TerminalPanel.tsx` initializes `height` to hardcoded `300` and never reads from settings. Dead UI giving users false confidence.

---

### M10. Incomplete Status Coverage Across Components

| File | Statuses Handled | Missing |
|------|-----------------|---------|
| `ProjectTable.tsx` lines 123-130 | All 6 | None |
| `ProjectHeader.tsx` lines 42-48 | 3 (active, icebox, archived) | crawlers, research, tools |
| `ActionsMenu.tsx` lines 82-87 | 4 (active, crawlers, icebox, archived) | research, tools |

**Recommendation:** Extract `STATUS_COLORS` to `lib/utils/statuses.ts` as a shared constant covering all six statuses.

---

### M11. Dropdown Menu Implemented Twice with Identical Patterns

**Files:** `components/dashboard/ProjectCard.tsx`, `components/actions/ActionsMenu.tsx`

Both implement their own dropdown using the same `useState` + `useRef` + `useClickOutside` + `MoreVertical` trigger with identical menu item styling (`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2`). Should be a shared `DropdownMenu` primitive.

---

### M12. Parameter Clamping Has a NaN Bug

**Files:** `app/api/activity/commits/route.ts:20`, `velocity/route.ts:20`, `search/route.ts:27`

All three use `Math.min(Math.max(parseInt(param, 10), MIN), MAX)`. If the param is `"abc"`, `parseInt` returns `NaN`, and `Math.min(Math.max(NaN, MIN), MAX)` returns `NaN` — not the default value. A shared `clampInt(param, min, max, defaultValue)` utility should handle `isNaN`.

---

### M13. Multiple `package.json` Reads Per Project Scan

**File:** `lib/scanner.ts`

During a single `scanProject()` call, `package.json` is read and parsed 5 separate times:
- `detectTechStack()` (line 70)
- `extractDescription()` (line 139)
- `getVersion()` (line 238)
- `getScripts()` (line 275)
- `getDependencies()` (line 282)

**Recommendation:** Read `package.json` once at the top of `scanProject()` and pass the parsed object to each function that needs it. Reduces filesystem I/O by ~4 reads per project across dozens of projects.

---

## LOW Priority Findings

### L1. Python Framework Detection Duplicated

**File:** `lib/scanner.ts` lines 103-107 vs 112-116 — identical fastapi/django/flask detection for `pyproject.toml` and `requirements.txt`. Extract `detectPythonFrameworks(content, techs)`.

### L2. `scanRcodegen` Bypasses `readJsonFile` Helper

**File:** `lib/scanner.ts` lines 378-389 — manually does `readFile` + `JSON.parse` instead of using the existing `readJsonFile<T>()` helper (lines 49-55).

### L3. `activity-types.ts` Mixes Types and Runtime Constants

The `API_LIMITS` object is a runtime constant that would be better placed in `lib/constants.ts`. The filename implies it's a types-only file.

### L4. `getPortConfig()` Is Dead Code

**File:** `lib/ports.ts` lines 26-28 — exported but zero production usages.

### L5. `hooks/index.ts` Missing `useProjects` Re-Export

The barrel file exports `useClickOutside` and `useProjectActions` but not `useProjects`, which is the most-used hook (6 components import directly).

### L6. Duplicate Cache TTL Constant

`lib/scan-cache.ts:4` (`CACHE_TTL_MS = 10_000`) and `lib/hooks/useProjects.ts:18` (`STALE_MS = 10_000`) — same value, different names, in different environments with no documented relationship.

### L7. `listeners` Array Should Be a Set

**File:** `lib/hooks/useProjects.ts:24` — `listeners` array uses `filter` on every unmount. A `Set<() => void>` makes `add`/`delete` O(1) and prevents potential issues under React Strict Mode's double-render.

### L8. `'use client'` on Presentational Component

**File:** `components/layout/SectionDivider.tsx` — has no hooks, state, or browser APIs. The `'use client'` directive is unnecessary.

### L9. Sidebar Storage Key String Duplicated

`SidebarContext.tsx` defines `STORAGE_KEY = 'code-manage-sidebar-collapsed'` but `SettingsPanel.tsx` hardcodes the same string directly. Should export and reuse the constant.

### L10. TerminalPanel History Grows Without Bound

**File:** `components/terminal/TerminalPanel.tsx` — `setHistory(prev => [...prev, ...])` accumulates entries with no max-history cap.

### L11. `docs/[filename]/route.ts` Duplicates Validation Between GET and PUT

Lines 24-40 (GET) and 74-93 (PUT) in the same file contain identical validation blocks. A private `validateDocRequest()` helper would eliminate 30 lines.

### L12. Reverse Constant Maps Maintained Manually

**File:** `lib/constants.ts` — `STATUS_FOLDERS` and `FOLDER_TO_STATUS` are manually synced. If a status is added to one but not the other, they silently diverge. `FOLDER_TO_STATUS` should be derived from `STATUS_FOLDERS`.

### L13. Collapsible Sections Use 3+ Different Toggle Patterns

`BugsCard`, `DocsCard`, `CodeQualityCard`, and `MarkdownEditor` each implement their own expand/collapse toggle with distinct state variables and chevron icon swapping. A shared `CollapsibleSection` primitive would consolidate this.

### L14. Modal Backdrop Click-to-Close Differs Across Modals

`BugModal`, `DocModal`, and `MarkdownEditor` use `onClick` + `stopPropagation`, while `NewProjectModal` uses a separate absolute backdrop `<div>`. Minor but creates confusion when debugging.

### L15. Error Message Containers Styled Inconsistently

`ProjectGrid.tsx` and `ProjectTable.tsx` use `bg-red-50 ... p-4 rounded-lg` while `MarkdownEditor.tsx` uses `px-4 py-2 ... text-sm` (no rounded, different padding). Should share an `ErrorMessage` component.

---

## Refactoring Roadmap (Suggested Priority Order)

| # | Action | Impact | Files Affected |
|---|--------|--------|----------------|
| 1 | Extract `MarkdownRenderer` shared component | Removes ~240 duplicated lines | 3 components |
| 2 | Extract `spawnProcess` utility to `lib/process.ts` | Removes ~100 duplicated lines, unifies process handling | 3 files |
| 3 | Extract `toSlug` utility to `lib/utils/slugs.ts` | Fixes search slug divergence bug, removes 4x duplication | 2 files |
| 4 | Add `toggleStar` to `useProjectActions` hook | Unifies error handling across 3 components | 4 files |
| 5 | Standardize `docs/route.ts` (logging, validatePath, handleRouteError) | Fixes the only route bypassing all standard patterns | 1 file |
| 6 | Split `scanner.ts` into modules | Major maintainability win for the largest file | 1 file -> 4 files |
| 7 | Extract `FilePreviewModal` shared component | Consolidates modal pattern | 2 components |
| 8 | Extract `clampInt` with NaN handling | Fixes latent NaN bug in 3 routes | 3+ files |
| 9 | Add shared `STATUS_COLORS` constant | Fixes incomplete status coverage | 3 components |
| 10 | Replace `alert()` with toast, `reload()` with `refresh()` | UX consistency | 2 components |
| 11 | Read `package.json` once per `scanProject` call | Reduces filesystem I/O | 1 file |
| 12 | Use hook for `open-editor` calls instead of manual fetch | Consistent error handling | 3 components |

---

## What's Done Well

- **Security model is strong:** Path traversal protection with `realpath`, prototype pollution checks via `secval`, terminal command sandboxing, output size limits, structured error responses (RFC 9457), and log field redaction.
- **`createOpenActionRoute` factory pattern** is excellent DRY API design — reduces two route files to 3 lines each. This should be the template for future route patterns.
- **`scan-cache.ts` request coalescing** prevents concurrent redundant full filesystem scans. This is a non-obvious performance optimization done correctly.
- **`chassis/` integration** brings proven patterns (Semaphore, ServiceError, workMap) without reinventing them.
- **Type safety is thorough** — Zod schemas for API validation, proper TypeScript interfaces for all data structures, and validated environment config.
- **Test coverage hits critical paths** — 8 test files covering pathSecurity, scanner, schemas, env, and key API routes (file, move, readme, terminal).
- **Concurrency is bounded** — Semaphore(3) for scanner workers, per-process timeouts, and kill-on-timeout are all present and correctly implemented.
- **Resource bounding (v1.4.3)** is thorough — output limits (5MB), timeouts (30s git, 60s terminal), stderr caps (4096 bytes), and worker limits (3 concurrent).

---

*Report generated by Claude:Opus 4.6 on 2026-02-17.*
