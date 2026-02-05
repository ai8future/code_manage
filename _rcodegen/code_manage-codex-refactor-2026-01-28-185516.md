Date Created: 2026-01-28 18:55:13 +0100
TOTAL_SCORE: 84/100

Overview
- Quick scan of `app/`, `components/`, `lib/`, `tests/`, and `docs/` (excluded `_studies`, `_proposals`, `_bugs_open`, `_bugs_fixed`, `_rcodegen` contents).
- Focused on duplication, maintainability, and refactor opportunities only. No code changes made.

Strengths
- Clear separation between API routes, shared `lib/` utilities, and UI components.
- Good baseline security posture with path validation and command whitelisting in server routes.
- Types are centralized in `lib/types.ts`, which keeps UI and API models aligned.

High-impact refactor opportunities
1) Centralize path validation for API routes
   - Files: `lib/api/createOpenActionRoute.ts`, `app/api/file/route.ts`, `app/api/projects/readme/route.ts`, `app/api/projects/docs/route.ts`, `app/api/projects/docs/[filename]/route.ts`, `app/api/actions/move/route.ts`, `app/api/terminal/route.ts`.
   - Current state: similar `path.resolve` + `realpath` checks are duplicated with slight differences, and one route uses `startsWith(CODE_BASE_PATH)` (prefix vulnerability risk).
   - Suggestion: add a single helper (ex: `lib/security/safePath.ts`) that resolves, realpaths, and validates boundaries using `path.relative` (or a strict `startsWith(CODE_BASE_PATH + path.sep)`), plus a consistent policy on whether the base directory itself is allowed. Replace per-route inline logic with that helper.

2) Consolidate Markdown rendering and front-matter handling
   - Files: `components/project/DocsCard.tsx`, `components/project/ReadmePreview.tsx`.
   - Current state: two separate `ReactMarkdown` component maps, identical code highlighting setup, and manual front-matter stripping in `DocModal`.
   - Suggestion: create a shared `MarkdownRenderer` component and a `stripFrontMatter` helper in `lib/markdown.ts`. Consider using the existing `/api/projects/docs/[filename]` endpoint in `DocModal` to avoid `/api/file` and client-side front-matter parsing.

3) Shared README/doc preview extraction
   - Files: `lib/scanner.ts` (`extractDescription`), `app/api/projects/readme/route.ts`, `app/api/projects/docs/route.ts`.
   - Current state: README filenames and "first paragraph" extraction logic appear in multiple places with slight variations.
   - Suggestion: centralize README filename list and preview extraction in `lib/markdown.ts` to reduce divergence.

4) Unify project status metadata
   - Files: `components/project/ProjectHeader.tsx`, `components/actions/ActionsMenu.tsx`, `lib/constants.ts`.
   - Current state: status labels, badge colors, and icons are defined in multiple places.
   - Suggestion: add a `statusMeta` map (label, icon, badge classes, order) to keep UI consistent and reduce repeated conditional strings.

5) Standardize "open/copy" project actions
   - Files: `lib/hooks/useProjectActions.ts`, `components/project/DocsCard.tsx`, `components/dashboard/ProjectCard.tsx`.
   - Current state: some components use `useProjectActions`, others reimplement fetch calls.
   - Suggestion: expand and reuse `useProjectActions` (or an `apiClient`) to centralize error handling/toasts and keep behavior consistent.

6) Centralize grade styling and thresholds
   - Files: `lib/utils/grades.ts`, `components/dashboard/ProjectCard.tsx`, `components/dashboard/CodeHealthSection.tsx`, `components/project/CodeQualityCard.tsx`.
   - Current state: thresholds (60/80) and badge class assembly are repeated in multiple components.
   - Suggestion: introduce a `GradeBadge` component and export grade thresholds from `lib/utils/grades.ts` to avoid repeated class strings.

Maintainability nits (lower effort)
- `app/api/projects/docs/route.ts` uses `realPath.startsWith(CODE_BASE_PATH)` without a boundary check; `/Users/cliff/Desktop/_code2` would pass. Centralizing path validation would close this.
- `lib/utils/dates.ts` has no guards for invalid or future dates; add a sanity check to avoid "-1 days ago" and similar edge cases.
- `components/editor/MarkdownEditor.tsx` injects a large `<style>` block in render; move to a CSS module or global stylesheet for easier reuse and fewer re-renders.

Quick wins
- Create `lib/markdown.ts` with shared README filenames, preview extraction, and front-matter utilities.
- Add `components/common/GradeBadge.tsx` and `components/common/StatusBadge.tsx` to replace repeated badge markup.
- Add `lib/security/safePath.ts` and swap existing path checks to it in all API routes.

Grade rationale
- Overall structure and typing are strong. The score is held back mainly by duplicated logic (path validation, markdown rendering, status metadata) and slight inconsistencies that would be easier to fix with a few shared helpers.
