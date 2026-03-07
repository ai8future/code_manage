# Rcodegen Cross-Report Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all confirmed, actionable bugs and security issues identified across 11 rcodegen reports (claude-audit x2, claude-fix, claude-quick, claude-refactor, codex-audit, codex-fix, codex-quick, codex-refactor, gemini-audit, gemini-fix, gemini-quick, gemini-refactor).

**Architecture:** Fixes are grouped into waves by file proximity. Each wave can be committed independently. Security fixes come first, then correctness, then quality.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod v4, React 18

**Exclusions:** No test additions (per instructions). No refactors that are purely stylistic.

---

## Wave 1: Terminal Route Security Hardening

### Task 1: Block `find -exec` and dangerous find arguments

**Files:**
- Modify: `app/api/terminal/route.ts:22-23` (add blocked set), `:59-96` (add validation)

**Step 1: Add BLOCKED_FIND_ARGS set after line 23**

After `const BLOCKED_NPX_ARGS = ...;`, add:

```typescript
const BLOCKED_FIND_ARGS = new Set(['-exec', '-execdir', '-delete', '-ok', '-okdir']);
```

**Step 2: Add find validation inside `validateCommandArgs` before the `return null`**

```typescript
  // Block dangerous find arguments
  if (baseCommand === 'find') {
    for (const arg of args) {
      if (BLOCKED_FIND_ARGS.has(arg)) {
        return `find argument '${arg}' is not allowed for security reasons`;
      }
    }
  }
```

### Task 2: Block absolute/traversal paths in file-reading command arguments

**Files:**
- Modify: `app/api/terminal/route.ts` (add path arg validation)

**Step 1: Add PATH_SENSITIVE_COMMANDS set after BLOCKED_FIND_ARGS**

```typescript
const PATH_SENSITIVE_COMMANDS = new Set(['cat', 'head', 'tail', 'grep', 'find', 'ls']);
```

**Step 2: Add path argument validation in the POST handler, after the `validateCommandArgs` check (after line 146)**

```typescript
    // Block absolute paths and traversal in path-sensitive commands
    if (PATH_SENSITIVE_COMMANDS.has(baseCommand)) {
      for (const arg of args) {
        if (arg.startsWith('-')) continue; // Skip flags
        if (arg.startsWith('/') && !arg.startsWith(CODE_BASE_PATH + '/')) {
          return errorResponse(forbiddenError('Absolute paths outside the code base are not allowed'));
        }
        if (arg.includes('..')) {
          return errorResponse(forbiddenError('Path traversal sequences are not allowed'));
        }
      }
    }
```

### Task 3: Restrict git to read-only subcommands

**Files:**
- Modify: `app/api/terminal/route.ts` (add git allowlist)

**Step 1: Add ALLOWED_GIT_SUBCOMMANDS set**

```typescript
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'tag', 'stash', 'blame',
  'rev-parse', 'shortlog', 'describe', 'ls-files', 'ls-tree', 'remote',
]);
```

**Step 2: Add git subcommand validation inside `validateCommandArgs`**

```typescript
  // Restrict git to read-only subcommands
  if (baseCommand === 'git') {
    const subcommand = args.find(a => !a.startsWith('-'));
    if (!subcommand || !ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
      return `git '${subcommand ?? '(none)'}' is not allowed for security reasons`;
    }
  }
```

### Task 4: Fix terminal exitCode always returning 1

**Files:**
- Modify: `app/api/terminal/route.ts:166`

**Step 1: Replace the exitCode line**

Change:
```typescript
            exitCode: error ? 1 : 0,
```
To:
```typescript
            exitCode: error
              ? (typeof (error as NodeJS.ErrnoException).code === 'number'
                ? (error as NodeJS.ErrnoException).code as number
                : 1)
              : 0,
```

### Task 5: Commit Wave 1

```bash
git add app/api/terminal/route.ts
git commit -m "security: harden terminal route — block find -exec, restrict git subcommands, validate path args"
```

---

## Wave 2: Docs Route & Path Security

### Task 6: Replace inline path check in docs/route.ts with validatePath

**Files:**
- Modify: `app/api/projects/docs/route.ts:1-8` (imports), `:49-62` (path validation), `:157-159` (error handler)

**Step 1: Update imports**

Add to imports:
```typescript
import { validatePath } from '@/lib/api/pathSecurity';
import { handleRouteError, pathErrorResponse } from '@/lib/api/errors';
import { createRequestLogger } from '@/lib/logger';
```

**Step 2: Replace inline path validation (lines 57-62)**

Replace:
```typescript
  // Validate path is within CODE_BASE_PATH
  const resolvedPath = path.resolve(projectPath);
  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
  if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
    return errorResponse(forbiddenError('Invalid path'));
  }
```
With:
```typescript
  const validation = await validatePath(projectPath, { requireExists: false });
  if (!validation.valid) {
    return pathErrorResponse(validation.error, validation.status);
  }
  const resolvedPath = validation.resolvedPath;
```

**Step 3: Add logger and fix error handler (line 49, 157-158)**

Add after the GET function declaration:
```typescript
  const log = createRequestLogger('projects/docs', request);
```

Replace:
```typescript
  } catch (error) {
    return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
  }
```
With:
```typescript
  } catch (error) {
    log.error({ err: error }, 'Error scanning docs');
    return handleRouteError(error);
  }
```

### Task 7: Add parent-directory symlink verification in pathSecurity.ts

**Files:**
- Modify: `lib/api/pathSecurity.ts:36-41`

**Step 1: Replace the catch block for non-existent paths**

Replace:
```typescript
  } catch {
    if (requireExists) {
      return { valid: false, error: 'Path does not exist', status: 404 };
    }
    // Path doesn't exist yet (for new files) - use the resolved path
    return { valid: true, resolvedPath };
  }
```
With:
```typescript
  } catch {
    if (requireExists) {
      return { valid: false, error: 'Path does not exist', status: 404 };
    }
    // Path doesn't exist yet — verify the parent directory is safe
    const parentDir = path.dirname(resolvedPath);
    try {
      const realParent = await fs.realpath(parentDir);
      if (!realParent.startsWith(CODE_BASE_PATH + '/') && realParent !== CODE_BASE_PATH) {
        return { valid: false, error: 'Invalid path: symlink outside allowed directory', status: 403 };
      }
    } catch {
      // Parent also doesn't exist — the prefix check on resolvedPath is sufficient
    }
    return { valid: true, resolvedPath };
  }
```

### Task 8: Add null-byte check in docs/[filename]/route.ts

**Files:**
- Modify: `app/api/projects/docs/[filename]/route.ts:33,85`

**Step 1: Update both filename validation checks**

Replace (line 33):
```typescript
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
```
With:
```typescript
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.includes('\0') || /^\.+$/.test(filename)) {
```

Apply identical change at line 85 (PUT handler).

### Task 9: Commit Wave 2

```bash
git add app/api/projects/docs/route.ts lib/api/pathSecurity.ts app/api/projects/docs/\[filename\]/route.ts
git commit -m "security: use validatePath in docs route, harden pathSecurity symlink check, block null bytes"
```

---

## Wave 3: API Input Validation & Correctness

### Task 10: Fix parseInt NaN propagation in commits and velocity routes

**Files:**
- Modify: `app/api/activity/commits/route.ts:18-21`
- Modify: `app/api/activity/velocity/route.ts:18-21`

**Step 1: Fix commits route (lines 18-21)**

Replace:
```typescript
  const limitParam = searchParams.get('limit');
  const limit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10), API_LIMITS.COMMITS_LIMIT_MIN), API_LIMITS.COMMITS_LIMIT_MAX)
    : API_LIMITS.COMMITS_LIMIT_DEFAULT;
```
With:
```typescript
  const limitParam = searchParams.get('limit');
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
  const limit = Number.isNaN(parsedLimit)
    ? API_LIMITS.COMMITS_LIMIT_DEFAULT
    : Math.min(Math.max(parsedLimit, API_LIMITS.COMMITS_LIMIT_MIN), API_LIMITS.COMMITS_LIMIT_MAX);
```

**Step 2: Fix velocity route (lines 18-21)**

Replace:
```typescript
  const daysParam = searchParams.get('days');
  const days = daysParam
    ? Math.min(Math.max(parseInt(daysParam, 10), API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX)
    : API_LIMITS.VELOCITY_DAYS_DEFAULT;
```
With:
```typescript
  const daysParam = searchParams.get('days');
  const parsedDays = daysParam ? parseInt(daysParam, 10) : NaN;
  const days = Number.isNaN(parsedDays)
    ? API_LIMITS.VELOCITY_DAYS_DEFAULT
    : Math.min(Math.max(parsedDays, API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX);
```

### Task 11: Add max lengths to Zod schemas

**Files:**
- Modify: `lib/schemas.ts:9-16,49-52`

**Step 1: Add max lengths to UpdateProjectSchema**

Replace:
```typescript
export const UpdateProjectSchema = z.object({
  status: ProjectStatusSchema.optional(),
  customName: z.string().optional(),
  customDescription: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  starred: z.boolean().optional(),
});
```
With:
```typescript
export const UpdateProjectSchema = z.object({
  status: ProjectStatusSchema.optional(),
  customName: z.string().max(200).optional(),
  customDescription: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(10000).optional(),
  starred: z.boolean().optional(),
});
```

**Step 2: Add max length to SearchQuerySchema**

Replace:
```typescript
export const SearchQuerySchema = z.object({
  q: z.string().min(1, { error: 'Search query is required' }),
  limit: z.coerce.number().int().positive().optional(),
});
```
With:
```typescript
export const SearchQuerySchema = z.object({
  q: z.string().min(1, { error: 'Search query is required' }).max(200, { error: 'Search query too long' }),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
```

### Task 12: Cap search param length in projects route

**Files:**
- Modify: `app/api/projects/route.ts:16`

Replace:
```typescript
  const search = searchParams.get('search')?.toLowerCase();
```
With:
```typescript
  const rawSearch = searchParams.get('search');
  const search = rawSearch ? rawSearch.slice(0, 200).toLowerCase() : undefined;
```

### Task 13: Validate slug in [slug]/route.ts PATCH handler

**Files:**
- Modify: `app/api/projects/[slug]/route.ts`

**Step 1: Add slug regex at module level (after imports)**

```typescript
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;
```

**Step 2: Add validation + existence check in PATCH (after `const { slug } = await params;`)**

```typescript
    if (!SLUG_RE.test(slug)) {
      return errorResponse(validationError('Invalid project slug'));
    }

    // Verify project exists before writing metadata
    const projects = await getCachedProjects();
    if (!projects.find((p) => p.slug === slug)) {
      return errorResponse(notFoundError('Project not found'));
    }
```

Note: `validationError` import already exists. Add `import { validationError, notFoundError } from '@/lib/chassis/errors';` if `validationError` is not already imported.

### Task 14: Commit Wave 3

```bash
git add app/api/activity/commits/route.ts app/api/activity/velocity/route.ts lib/schemas.ts app/api/projects/route.ts app/api/projects/\[slug\]/route.ts
git commit -m "fix: NaN propagation in activity routes, add schema max lengths, cap search, validate slug"
```

---

## Wave 4: Search Route & Config Safety

### Task 15: Add --fixed-strings to ripgrep in search route

**Files:**
- Modify: `app/api/search/route.ts:57-64`

**Step 1: Add --fixed-strings to the args array**

After `'--max-filesize=1M',` add:
```typescript
      '--fixed-strings',
```

### Task 16: Make writeConfig private and atomic

**Files:**
- Modify: `lib/config.ts:68-71`

Replace:
```typescript
export async function writeConfig(config: CodeManageConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
```
With:
```typescript
async function writeConfig(config: CodeManageConfig): Promise<void> {
  const configPath = getConfigPath();
  const tmpPath = `${configPath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  await fs.rename(tmpPath, configPath);
}
```

### Task 17: Replace process.exit(1) with throw in chassis config

**Files:**
- Modify: `lib/chassis/config.ts:39-40`

Replace:
```typescript
    console.error(`config: validation failed\n${lines.join('\n')}`);
    process.exit(1);
  }

  return result.data;
```
With:
```typescript
    throw new Error(`config: validation failed\n${lines.join('\n')}`);
  }

  return result.data;
```

### Task 18: Commit Wave 4

```bash
git add app/api/search/route.ts lib/config.ts lib/chassis/config.ts
git commit -m "security: add --fixed-strings to rg, make writeConfig atomic+private, throw instead of exit"
```

---

## Wave 5: Date Utils, Toast Cleanup, Velocity Cache, CSP

### Task 19: Fix formatRelativeDate — invalid dates, future dates, singular units

**Files:**
- Modify: `lib/utils/dates.ts`

Replace entire file with:
```typescript
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  let diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) diffMs = 0;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```

### Task 20: Add stale entry eviction to velocity cache

**Files:**
- Modify: `app/api/activity/velocity/route.ts:107-108`

Before `velocityCache.set(days, ...)`, add:
```typescript
    // Evict stale cache entries
    for (const [key, entry] of velocityCache) {
      if (Date.now() - entry.ts >= VELOCITY_CACHE_TTL) velocityCache.delete(key);
    }
```

### Task 21: Add CSP header and remove deprecated X-XSS-Protection

**Files:**
- Modify: `next.config.mjs`

Replace the X-XSS-Protection block:
```javascript
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
```
With:
```javascript
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none';",
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
```

### Task 22: Commit Wave 5

```bash
git add lib/utils/dates.ts app/api/activity/velocity/route.ts next.config.mjs
git commit -m "fix: date formatting edge cases, evict stale velocity cache, add CSP header"
```

---

## Summary

| Wave | Tasks | Files Modified | Focus |
|------|-------|---------------|-------|
| 1 | 1-5 | 1 file | Terminal security |
| 2 | 6-9 | 3 files | Docs route + path security |
| 3 | 10-14 | 5 files | Input validation + correctness |
| 4 | 15-18 | 3 files | Search + config safety |
| 5 | 19-22 | 3 files | Date utils + cache + CSP |

**Total: 20 issues fixed across 15 files in 5 independent commits.**
