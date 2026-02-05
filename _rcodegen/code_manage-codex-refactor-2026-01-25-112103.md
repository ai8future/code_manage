Date Created: 2026-01-25 11:21:00 +0100
TOTAL_SCORE: 79/100

# Code Quality & Maintainability Review

## Overall assessment
The codebase is clean, small, and readable, with clear separation between API routes, UI components, and scanning utilities. The main maintainability risks are duplication (constants, UI helpers, and Markdown rendering) and scattered configuration/state definitions (paths, statuses, settings). Performance will degrade as the project count grows because multiple client surfaces trigger full scans.

## Strengths
- Clear feature boundaries: scanning logic in `lib`, UI in `components`, routes in `app/api`.
- Consistent styling and Tailwind usage.
- Good use of TypeScript interfaces for data exchange (`Project`, `BugInfo`, `RcodegenInfo`).

## High-impact refactor opportunities
1) Centralize base-path and shared constants
- Files: `lib/scanner.ts`, `app/api/file/route.ts`, `app/api/actions/open-finder/route.ts`, `app/api/actions/open-editor/route.ts`, `app/api/actions/move/route.ts`, `components/settings/SettingsPanel.tsx`, `app/page.tsx`.
- Impact: A single source of truth for `CODE_BASE_PATH` and README filenames removes repeated edits and reduces risk of mismatch. Consider `lib/constants.ts` (or env-driven config) and import everywhere.

2) Consolidate project status configuration
- Files: `lib/scanner.ts` (status folders), `app/[status]/page.tsx` (status config), `components/actions/ActionsMenu.tsx` (move options), `components/settings/SettingsPanel.tsx` (default status type), `app/api/projects/route.ts` (valid statuses).
- Impact: Single config object for labels/icons/folder mapping avoids drift (e.g., `crawlers` missing from move options). Expose `ProjectStatus` list + mapping in one module.

3) Extract shared Markdown renderer
- Files: `components/project/ReadmePreview.tsx`, `components/project/BugsCard.tsx`.
- Impact: Markdown component configuration and Prism setup are duplicated. A shared `MarkdownRenderer` component would keep typography, code styles, and theme changes in one place.

4) Reduce repeated file reads during project scan
- Files: `lib/scanner.ts`.
- Impact: `detectTechStack`, `getVersion`, `getScripts`, `getDependencies` each read `package.json` separately. A single `readPackageJson` per project (cached in-memory for the scan) reduces I/O and simplifies future tech detection rules.

5) Introduce caching for project scans
- Files: `app/api/projects/route.ts`, `app/api/projects/[slug]/route.ts`, `components/dashboard/ProjectGrid.tsx`, `components/sidebar/SidebarProjectList.tsx`, `components/sidebar/SidebarWrapper.tsx`, `components/dashboard/CodeHealthSection.tsx`, `components/settings/SettingsPanel.tsx`.
- Impact: Multiple components call `/api/projects`, which re-scans the filesystem every time. Add an in-memory cache with TTL, or a background scan/index in `lib` to reduce redundant work and keep UI snappy as project count grows.

## Duplication & utility extraction
- Grade thresholds repeated in `components/dashboard/CodeHealthSection.tsx`, `components/project/CodeQualityCard.tsx`, and `components/dashboard/ProjectCard.tsx`. Extract to `lib/grades.ts` with `getGradeColor()` + `getGradeBadgeClasses()`.
- Date formatting exists in multiple flavors (`ProjectCard` relative, `CodeQualityCard` absolute). Create a `lib/dates.ts` with `formatRelativeDate` and `formatShortDate` for consistency.
- Outside-click menu handling duplicated in `components/dashboard/ProjectCard.tsx` and `components/actions/ActionsMenu.tsx`. A `useOutsideClick` hook would reduce repeated event wiring.
- Project actions (`open-editor`, `open-finder`, `copy path`) repeated in `components/dashboard/ProjectGrid.tsx` and `components/actions/ActionsMenu.tsx`. A `useProjectActions` hook simplifies callbacks and error handling.

## Consistency & correctness notes
- `app/api/actions/move/route.ts` lacks validation for `projectPath` (not constrained to base path) and `newStatus` (invalid status defaults to root). Align with the security checks used in `open-editor`/`open-finder`/`file` routes.
- `app/api/projects/[slug]/route.ts` imports `scanProject` but never uses it; remove to avoid lint noise.
- `components/settings/SettingsPanel.tsx` duplicates the sidebar collapsed localStorage logic already in `components/sidebar/SidebarContext.tsx`. Consider a single settings source of truth (either localStorage or config via `lib/config.ts`).
- `SettingsPanel` excludes `crawlers` in `defaultStatus`, while `ProjectStatus` includes it. If `crawlers` is intentionally excluded from the UI, document it; otherwise, add it for consistency.
- `scanAllProjects` calls `scanProject`, which re-checks `fs.stat` even though the directory listing already filters directories; consider removing redundant stat checks in hot paths.

## Suggested refactor order (low disruption)
1) Add `lib/constants.ts` for `CODE_BASE_PATH`, README filenames, and status metadata.
2) Extract `MarkdownRenderer`, `useOutsideClick`, and `useProjectActions` utilities.
3) Implement scan caching and single `package.json` read per project.
4) Align settings and status handling across API/UI/config.

## Risks if left as-is
- Status drift (e.g., `crawlers` missing in move UI/API) leads to inconsistent behavior and confusion.
- Hardcoded paths and duplicated lists make base-path changes risky and error-prone.
- Full rescans on every API hit will slow down as project count grows.
