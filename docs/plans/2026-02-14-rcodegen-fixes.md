# Rcodegen Report Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 14 validated issues identified across 12 rcodegen audit reports, covering security gaps, React bugs, date utility crashes, and code quality issues.

**Architecture:** Targeted fixes to existing files only — no new files, no new abstractions. Each fix is self-contained and independently verifiable.

**Tech Stack:** Next.js 16, React 18, TypeScript, Zod, Vitest

---

### Task 1: Fix docs route — use validatePath instead of hand-rolled validation

**Files:**
- Modify: `app/api/projects/docs/route.ts:1-10,49-63`

**Step 1: Replace imports and path validation**

Replace the current imports and validation block with the shared pathSecurity module:

```typescript
// Replace these imports:
import { CODE_BASE_PATH } from '@/lib/constants';
import { validationError, forbiddenError } from '@/lib/chassis/errors';
import { errorResponse } from '@/lib/api/errors';

// With:
import { validationError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError, pathErrorResponse } from '@/lib/api/errors';
import { validatePath } from '@/lib/api/pathSecurity';
import { CODE_BASE_PATH } from '@/lib/constants';
```

Replace the hand-rolled path validation (lines 57-62):
```typescript
  // OLD:
  const resolvedPath = path.resolve(projectPath);
  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
  if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
    return errorResponse(forbiddenError('Invalid path'));
  }

  // NEW:
  const pathResult = await validatePath(projectPath, { requireExists: false });
  if (!pathResult.valid) {
    return pathErrorResponse(pathResult.error, pathResult.status);
  }
  const resolvedPath = pathResult.resolvedPath;
```

**Step 2: Fix error handler to use RFC 9457**

Replace the catch-all at the end of the function:
```typescript
  // OLD:
  } catch (error) {
    return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
  }

  // NEW:
  } catch (error) {
    return handleRouteError(error);
  }
```

**Step 3: Build to verify no compile errors**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/api/projects/docs/route.ts
git commit -m "fix: docs route uses validatePath and RFC 9457 errors"
```

---

### Task 2: Fix double JSON.parse in parseSecureBody

**Files:**
- Modify: `lib/chassis/secval.ts`
- Modify: `lib/api/validate.ts:40-63`

**Step 1: Add validateAndParseJSON to secval.ts**

Add after the existing `validateJSON` function:

```typescript
/**
 * Parse JSON, validate for dangerous keys/nesting, and return the parsed value.
 * Avoids double-parse overhead vs calling validateJSON + JSON.parse separately.
 */
export function validateAndParseJSON(data: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    throw new SecvalError(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  walkValue(parsed, 0);
  return parsed;
}
```

**Step 2: Update parseSecureBody to use single parse**

In `lib/api/validate.ts`, replace the `parseSecureBody` function body:

```typescript
export function parseSecureBody<T>(
  schema: ZodType<T>,
  rawBody: string,
): ParseSuccess<T> | ParseFailure {
  let data: unknown;
  try {
    data = validateAndParseJSON(rawBody);
  } catch (err) {
    if (err instanceof SecvalError) {
      return {
        success: false,
        response: errorResponse(validationError(err.message)),
      };
    }
    return {
      success: false,
      response: errorResponse(validationError('Invalid JSON')),
    };
  }

  return parseBody(schema, data);
}
```

Update the import to include `validateAndParseJSON`:
```typescript
import { validateAndParseJSON, SecvalError } from '@/lib/chassis/secval';
```

**Step 3: Run existing tests**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx vitest run`
Expected: All existing tests pass

**Step 4: Commit**

```bash
git add lib/chassis/secval.ts lib/api/validate.ts
git commit -m "perf: eliminate double JSON.parse in parseSecureBody"
```

---

### Task 3: Fix useClickOutside unstable callback dependency

**Files:**
- Modify: `lib/hooks/useClickOutside.ts`

**Step 1: Use ref to stabilize callback**

Replace entire file content:

```typescript
import { useEffect, useRef, RefObject } from 'react';

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  callback: () => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callbackRef.current();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref]);
}
```

**Step 2: Build to verify**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx next build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add lib/hooks/useClickOutside.ts
git commit -m "fix: useClickOutside uses ref for stable callback"
```

---

### Task 4: Fix React hook dependencies in ProjectPage and ProjectTable

**Files:**
- Modify: `app/project/[slug]/page.tsx:1-4,25-45`
- Modify: `components/dashboard/ProjectTable.tsx:2,52-56,278,281-302`

**Step 1: Fix ProjectPage fetchProject dependency**

In `app/project/[slug]/page.tsx`:
- Add `useCallback` to import
- Wrap `fetchProject` in `useCallback` with `[slug]` dependency
- Update `useEffect` to depend on `fetchProject`

```typescript
// Line 1 - update import:
import { useEffect, useState, useCallback } from 'react';

// Lines 25-41 - wrap in useCallback:
  const fetchProject = useCallback(async () => {
    // ... existing body unchanged ...
  }, [slug]);

// Lines 43-45 - update useEffect:
  useEffect(() => {
    fetchProject();
  }, [fetchProject]);
```

**Step 2: Fix ProjectTable excludeStatuses and columns dependencies**

In `components/dashboard/ProjectTable.tsx`:

Add a stable key for excludeStatuses before the sorting state:
```typescript
// After line 55 (const [error, ...]):
  const excludeKey = excludeStatuses?.join(',') ?? '';
```

Fix the columns useMemo dependency array (line 278):
```typescript
// OLD:
    []
// NEW:
    [openInEditor, openInFinder, copyPath]
```

Fix the useEffect dependency (line 302):
```typescript
// OLD:
  }, [status, excludeStatuses]);
// NEW:
  }, [status, excludeKey]);
```

**Step 3: Build to verify**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/project/[slug]/page.tsx components/dashboard/ProjectTable.tsx
git commit -m "fix: React hook dependency arrays in ProjectPage and ProjectTable"
```

---

### Task 5: Fix date formatting utilities

**Files:**
- Modify: `lib/utils/dates.ts`

**Step 1: Rewrite with invalid date guards, pluralization, future handling**

Replace entire file:

```typescript
function pluralize(value: number, unit: string): string {
  return value === 1 ? unit : `${unit}s`;
}

export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor(Math.abs(diffMs) / dayMs);
  const inPast = diffMs >= 0;

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return inPast ? 'Yesterday' : 'Tomorrow';
  if (diffDays < 7) return inPast ? `${diffDays} ${pluralize(diffDays, 'day')} ago` : `In ${diffDays} ${pluralize(diffDays, 'day')}`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return inPast
      ? `${weeks} ${pluralize(weeks, 'week')} ago`
      : `In ${weeks} ${pluralize(weeks, 'week')}`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return inPast
      ? `${months} ${pluralize(months, 'month')} ago`
      : `In ${months} ${pluralize(months, 'month')}`;
  }
  const years = Math.floor(diffDays / 365);
  return inPast
    ? `${years} ${pluralize(years, 'year')} ago`
    : `In ${years} ${pluralize(years, 'year')}`;
}

export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```

**Step 2: Run tests**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add lib/utils/dates.ts
git commit -m "fix: date utils handle invalid dates, pluralization, and future dates"
```

---

### Task 6: Fix ActionsMenu alert() calls and copyPath error handling

**Files:**
- Modify: `components/actions/ActionsMenu.tsx:1-6,24-26,69-75`
- Modify: `lib/hooks/useProjectActions.ts:35-38`

**Step 1: Replace alert() with toast in ActionsMenu**

Add toast import and usage:
```typescript
// Add import:
import { useToast } from '@/components/toast/ToastContext';

// In component body, add:
  const { addToast } = useToast();

// Replace alert calls:
  // OLD: alert(error.detail || 'Failed to move project');
  // NEW: addToast(error.detail || 'Failed to move project', 'error');

  // OLD: alert('Failed to move project');
  // NEW: addToast('Failed to move project', 'error');
```

**Step 2: Add error handling to copyPath**

In `lib/hooks/useProjectActions.ts`, update `copyPath`:
```typescript
  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      addToast('Path copied to clipboard', 'success');
    } catch {
      addToast('Failed to copy path', 'error');
    }
  }, [addToast]);
```

**Step 3: Build to verify**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add components/actions/ActionsMenu.tsx lib/hooks/useProjectActions.ts
git commit -m "fix: replace alert() with toast, add clipboard error handling"
```

---

### Task 7: Block git path-override args in terminal route

**Files:**
- Modify: `app/api/terminal/route.ts:59-96`

**Step 1: Add blocked git args to validateCommandArgs**

Add at the top of the file, after the existing blocked args sets:
```typescript
const BLOCKED_GIT_ARGS = new Set(['-C', '--work-tree', '--git-dir']);
```

Add to `validateCommandArgs`, before the `return null`:
```typescript
  // Block git path overrides that escape cwd
  if (baseCommand === 'git') {
    for (const arg of args) {
      if (
        BLOCKED_GIT_ARGS.has(arg) ||
        arg.startsWith('--work-tree=') ||
        arg.startsWith('--git-dir=') ||
        arg.startsWith('-C')
      ) {
        return `git argument '${arg}' is not allowed for security reasons`;
      }
    }
  }
```

**Step 2: Run tests**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add app/api/terminal/route.ts
git commit -m "fix: block git -C/--work-tree/--git-dir args in terminal"
```

---

### Task 8: Fix file route requireExists and move @types to devDependencies

**Files:**
- Modify: `app/api/file/route.ts:19`
- Modify: `package.json`

**Step 1: Fix requireExists in file route**

In `app/api/file/route.ts`, change line 19:
```typescript
// OLD:
  const pathResult = await validatePath(filePath, { requireExists: false });
// NEW:
  const pathResult = await validatePath(filePath);
```

(Default is `requireExists: true`, which is correct for a read operation.)

**Step 2: Move @types/react-syntax-highlighter to devDependencies**

In `package.json`, remove `"@types/react-syntax-highlighter": "^15.5.13"` from `dependencies` and add it to `devDependencies`.

**Step 3: Install to update lockfile**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npm install`
Expected: Successful install

**Step 4: Build to verify**

Run: `cd /Users/cliff/Desktop/_code/builder_suite/code_manage && npx next build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add app/api/file/route.ts package.json package-lock.json
git commit -m "fix: file route requires path exists, move @types to devDeps"
```
