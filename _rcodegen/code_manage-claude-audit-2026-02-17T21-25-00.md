Date Created: 2026-02-17T21:25:00Z
Date Updated: 2026-02-17T23:30:00-05:00
TOTAL_SCORE: 72/100

# code_manage — Comprehensive Security & Code Quality Audit

**Auditor:** Claude:Opus 4.6 (Claude Code)
**Scope:** Full codebase — API routes, core libraries, React components, configuration, tests
**Files Analyzed:** 60+ source files (excluding node_modules)

---

## Score Breakdown

| Category | Weight | Score | Notes |
|---|---|---|---|
| Security (injection, path traversal, auth) | 30% | 22/30 | Good `spawn`/`execFile` usage, path validation, secval. Gaps in slug validation, missing CSP, regex passthrough to rg |
| Error Handling & Resilience | 15% | 11/15 | RFC 9457 responses, 5xx suppression. Silent catch blocks, NaN propagation |
| Input Validation | 15% | 10/15 | Zod schemas, API_LIMITS. Missing max lengths, dead schemas, NaN edge cases |
| Code Quality & Maintainability | 15% | 10/15 | Clean architecture, chassis patterns. Hardcoded paths, version mismatch, dead code |
| Frontend Quality | 10% | 8/10 | Proper hooks, shared cache. Minor missing error states |
| Test Coverage | 10% | 5/10 | Unit tests for schemas/scanner. Zero coverage for security-critical paths |
| Configuration & Build | 5% | 4/5 | Good Next.js setup. Missing CSP header, dev deps misplaced |

---

## CRITICAL Findings

### CRIT-1: `process.exit(1)` During Module Initialization Kills Next.js Server
**File:** `lib/chassis/config.ts:32-40`
**Severity:** CRITICAL

The `mustLoad` function calls `process.exit(1)` if config validation fails. Since `lib/env.ts` calls `mustLoad` at import time, and `lib/constants.ts` imports `env`, a single missing/malformed environment variable will hard-kill the Next.js process during module evaluation — including during HMR, SSR, and API route loading. Next.js is designed to handle startup errors gracefully; `process.exit()` bypasses all of that.

```diff
--- a/lib/chassis/config.ts
+++ b/lib/chassis/config.ts
@@ -30,11 +30,9 @@ export function mustLoad<T extends z.ZodType>(
   const result = schema.safeParse(raw);
   if (!result.success) {
     const lines = result.error.issues.map(
       (i) => `  ${i.path.join('.')}: ${i.message}`
     );
-    console.error(`config: validation failed\n${lines.join('\n')}`);
-    process.exit(1);
+    throw new Error(`config: validation failed\n${lines.join('\n')}`);
   }
-  // unreachable after exit, but satisfies TS
   return result.data;
 }
```

### CRIT-2: Unvalidated `slug` Parameter Passed to Config Layer in PATCH Handler
**File:** `app/api/projects/[slug]/route.ts:53,60`
**Severity:** CRITICAL

The PATCH handler extracts `slug` from the URL and passes it directly to `setProjectMetadata(slug, ...)` without any validation or existence check. A request to `PATCH /api/projects/../../malicious` writes metadata for a non-existent project with an unvalidated key. Combined with the GET handler also passing unvalidated slugs to `getProjectMetadata`, this is a config pollution vector.

```diff
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@ -8,11 +8,17 @@ import { errorResponse, handleRouteError } from '@/lib/api/errors';

 export const dynamic = 'force-dynamic';

+const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;
+
 export async function GET(
   request: Request,
   { params }: { params: Promise<{ slug: string }> }
 ) {
   const log = createRequestLogger('projects/[slug]', request);
   const { slug } = await params;
+
+  if (!SLUG_RE.test(slug)) {
+    return errorResponse(validationError('Invalid project slug'));
+  }

   try {
     const projects = await getCachedProjects();
@@ -48,6 +54,16 @@ export async function PATCH(
   const log = createRequestLogger('projects/[slug]', request);
   const { slug } = await params;

+  if (!SLUG_RE.test(slug)) {
+    return errorResponse(validationError('Invalid project slug'));
+  }
+
   try {
+    // Verify project exists before writing metadata
+    const projects = await getCachedProjects();
+    if (!projects.find((p) => p.slug === slug)) {
+      return errorResponse(notFoundError('Project not found'));
+    }
+
     const rawBody = await request.text();
     const result = parseSecureBody(UpdateProjectSchema, rawBody);
```

---

## HIGH Findings

### HIGH-1: Missing Content-Security-Policy Header; Deprecated X-XSS-Protection
**File:** `next.config.mjs:3-27`
**Severity:** HIGH

The app sets `X-XSS-Protection: 1; mode=block` which is deprecated and ignored by modern browsers (Chrome removed it in 2019). More critically, no `Content-Security-Policy` header is set. The app uses `@uiw/react-md-editor` (renders HTML), `react-syntax-highlighter`, and an xterm terminal — all XSS vectors without a CSP.

```diff
--- a/next.config.mjs
+++ b/next.config.mjs
@@ -14,8 +14,12 @@ const nextConfig = {
           },
           {
-            key: 'X-XSS-Protection',
-            value: '1; mode=block',
+            key: 'Content-Security-Policy',
+            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none';",
+          },
+          {
+            key: 'Permissions-Policy',
+            value: 'camera=(), microphone=(), geolocation=()',
           },
           {
```

### HIGH-2: `parseInt` NaN Propagation in Velocity and Commits Routes
**File:** `app/api/activity/velocity/route.ts:19-21`, `app/api/activity/commits/route.ts:19-21`
**Severity:** HIGH

When `daysParam = 'abc'`, `parseInt('abc', 10)` returns `NaN`. `Math.max(NaN, 1)` returns `NaN`, and `Math.min(NaN, 365)` also returns `NaN`. This propagates `NaN` into the git `--since=NaN days ago` argument and the cache key. Git will reject the argument or return no output silently.

```diff
--- a/app/api/activity/velocity/route.ts
+++ b/app/api/activity/velocity/route.ts
@@ -16,9 +16,10 @@ export async function GET(request: Request) {
   const log = createRequestLogger('activity/velocity', request);
   const { searchParams } = new URL(request.url);
   const daysParam = searchParams.get('days');
-  const days = daysParam
-    ? Math.min(Math.max(parseInt(daysParam, 10), API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX)
-    : API_LIMITS.VELOCITY_DAYS_DEFAULT;
+  const parsedDays = daysParam ? parseInt(daysParam, 10) : NaN;
+  const days = Number.isNaN(parsedDays)
+    ? API_LIMITS.VELOCITY_DAYS_DEFAULT
+    : Math.min(Math.max(parsedDays, API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX);
```

Apply the identical fix to `app/api/activity/commits/route.ts` lines 18-21.

### HIGH-3: Command Resolved via PATH — No Absolute Path for `code` and `open`
**File:** `lib/api/createOpenActionRoute.ts:16,30`
**Severity:** HIGH

The `command` parameter is a bare string (`'code'`, `'open'`) resolved via the system PATH at runtime. If PATH is manipulated (compromised dependency, malicious `.npmrc` install script), a different binary could execute.

```diff
--- a/lib/api/createOpenActionRoute.ts
+++ b/lib/api/createOpenActionRoute.ts
@@ -10,7 +10,14 @@ const execFileAsync = promisify(execFile);
 const openActionSchema = z.object({
   path: z.string().min(1, { error: 'Path is required' }),
 });

-export function createOpenActionRoute(command: string, commandArgs: string[] = []) {
+const ALLOWED_COMMANDS: Record<string, string> = {
+  code: '/usr/local/bin/code',
+  open: '/usr/bin/open',
+};
+
+export function createOpenActionRoute(commandKey: string, commandArgs: string[] = []) {
+  const command = ALLOWED_COMMANDS[commandKey];
+  if (!command) throw new Error(`Unknown command key: ${commandKey}`);
   return async function POST(request: Request) {
     const log = createRequestLogger(`open/${command}`, request);
```

### HIGH-4: `search` Query Parameter Has No Length Cap (DoS via `.includes()`)
**File:** `app/api/projects/route.ts:16,68-73`
**Severity:** HIGH

The `search` parameter has no maximum length. A multi-megabyte search string triggers `.includes()` across all projects' names, descriptions, and tech stacks — a CPU-based DoS vector. By contrast, the `/api/search` route correctly caps at 200 characters.

```diff
--- a/app/api/projects/route.ts
+++ b/app/api/projects/route.ts
@@ -13,7 +13,8 @@ export async function GET(request: Request) {
   const log = createRequestLogger('projects', request);
   const { searchParams } = new URL(request.url);
   const statusParam = searchParams.get('status');
-  const search = searchParams.get('search')?.toLowerCase();
+  const rawSearch = searchParams.get('search');
+  const search = rawSearch ? rawSearch.slice(0, 200).toLowerCase() : undefined;
```

### HIGH-5: `SearchQuerySchema` Missing Max Length; Dead Code
**File:** `lib/schemas.ts:49-52`
**Severity:** HIGH

The `SearchQuerySchema` has `z.string().min(1)` but no `.max()`. It is also never imported by the search route, making it dead code. If a future route uses it, the length cap is absent.

```diff
--- a/lib/schemas.ts
+++ b/lib/schemas.ts
@@ -47,8 +47,8 @@ export const CreateProjectSchema = z.object({

 /** GET /api/search query params */
 export const SearchQuerySchema = z.object({
-  q: z.string().min(1, { error: 'Search query is required' }),
-  limit: z.coerce.number().int().positive().optional(),
+  q: z.string().min(1, { error: 'Search query is required' }).max(200, { error: 'Search query too long' }),
+  limit: z.coerce.number().int().positive().max(500).optional(),
 });
```

### HIGH-6: `UpdateProjectSchema` String Fields Have No Max Length
**File:** `lib/schemas.ts:9-16`
**Severity:** HIGH

`notes`, `customDescription`, and `customName` are `z.string().optional()` with no length limit. A client can persist a 1MB note to the config file.

```diff
--- a/lib/schemas.ts
+++ b/lib/schemas.ts
@@ -8,10 +8,10 @@ export const ProjectStatusSchema = z.enum([
 /** PATCH /api/projects/[slug] */
 export const UpdateProjectSchema = z.object({
   status: ProjectStatusSchema.optional(),
-  customName: z.string().optional(),
-  customDescription: z.string().optional(),
+  customName: z.string().max(200).optional(),
+  customDescription: z.string().max(1000).optional(),
   tags: z.array(z.string()).optional(),
-  notes: z.string().optional(),
+  notes: z.string().max(10000).optional(),
   starred: z.boolean().optional(),
 });
```

### HIGH-7: Hardcoded Personal Filesystem Path
**File:** `lib/env.ts:8`, `app/layout.tsx:22`, `app/page.tsx:15`
**Severity:** HIGH

`/Users/cliff/Desktop/_code` is hardcoded as the default for `CODE_BASE_PATH`. This makes the app non-portable and leaks the developer's username in the HTML meta description.

```diff
--- a/lib/env.ts
+++ b/lib/env.ts
@@ -5,7 +5,7 @@ const envSchema = z.object({
   codeBasePath: z
     .string()
     .min(1)
-    .default('/Users/cliff/Desktop/_code'),
+    .default(process.env.HOME ? `${process.env.HOME}/Desktop/_code` : '/tmp/_code'),
 });
```

---

## MEDIUM Findings

### MED-1: Unbounded `velocityCache` Map — Stale Entries Never Evicted
**File:** `app/api/activity/velocity/route.ts:12,108`

```diff
--- a/app/api/activity/velocity/route.ts
+++ b/app/api/activity/velocity/route.ts
@@ -105,6 +105,10 @@ export async function GET(request: Request) {
       .sort((a, b) => a.date.localeCompare(b.date));

     // Cache result
+    for (const [key, entry] of velocityCache) {
+      if (Date.now() - entry.ts >= VELOCITY_CACHE_TTL) velocityCache.delete(key);
+    }
     velocityCache.set(days, { data, ts: Date.now() });
```

### MED-2: Search Route Passes User Query as Regex to `rg` — ReDoS Risk
**File:** `app/api/search/route.ts:57-64`

While rg's Rust regex engine is linear-time, treating user input as regex by default is an unnecessary risk.

```diff
--- a/app/api/search/route.ts
+++ b/app/api/search/route.ts
@@ -55,6 +55,7 @@ export async function GET(request: Request) {
     const args = [
       '--json',
       '--max-count=10',
       '--max-filesize=1M',
+      '--fixed-strings',
       ...excludePatterns,
       '--',
```

### MED-3: No Request Body Size Check Before `request.text()` in Open Actions
**File:** `lib/api/createOpenActionRoute.ts:20`

```diff
--- a/lib/api/createOpenActionRoute.ts
+++ b/lib/api/createOpenActionRoute.ts
@@ -17,6 +17,9 @@ export function createOpenActionRoute(commandKey: string, commandArgs: string[] =
   return async function POST(request: Request) {
     const log = createRequestLogger(`open/${command}`, request);
     try {
+      const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
+      if (contentLength > 4096) {
+        return errorResponse(validationError('Request body too large'));
+      }
       const rawBody = await request.text();
```

### MED-4: `package.json` Version Mismatch (0.1.0 vs 1.4.x)
**File:** `package.json:3`

The `VERSION` file says v1.4.x but `package.json` still reads `0.1.0`. Security scanners report CVEs by package version.

```diff
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "code-manage",
-  "version": "0.1.0",
+  "version": "1.4.1",
```

### MED-5: Dev-Only Packages in `dependencies`
**File:** `package.json:14-22`

`@eslint/eslintrc`, `@eslint/js`, `@types/react-syntax-highlighter`, and `globals` should be in `devDependencies`.

### MED-6: Silent Git Error Swallowing — No Logging
**File:** `app/api/activity/commits/route.ts:76-78`, `app/api/activity/velocity/route.ts:78-80`

```diff
--- a/app/api/activity/commits/route.ts
+++ b/app/api/activity/commits/route.ts
@@ -74,7 +74,8 @@ export async function GET(request: Request) {
           });
         }
-        } catch {
-          // Skip projects whose git log fails or times out
+        } catch (err) {
+          log.warn({ err, project: project.name }, 'Skipping project: git log failed');
         }
```

### MED-7: `workStream` Yields in Completion Order Despite Sequential Index
**File:** `lib/chassis/work.ts:159-207`

The generator uses `yieldIndex` suggesting input-order emission, but pushes results in completion order. Document the behavior clearly.

### MED-8: `app/activity/page.tsx` — No Error State Display; Loading Flag Race
**File:** `app/activity/page.tsx:29-53`

Both `fetch` calls catch errors with `console.error` only. No user-facing error state is shown. The `loading` flag can become `false` while commits are still loading.

### MED-9: `tailwind.config.ts` Missing `lib/` in Content Paths
**File:** `tailwind.config.ts:5-9`

If `lib/` files return Tailwind class strings dynamically, those classes will be purged from production CSS.

```diff
--- a/tailwind.config.ts
+++ b/tailwind.config.ts
@@ -5,6 +5,7 @@ const config: Config = {
     "./pages/**/*.{js,ts,jsx,tsx,mdx}",
     "./components/**/*.{js,ts,jsx,tsx,mdx}",
     "./app/**/*.{js,ts,jsx,tsx,mdx}",
+    "./lib/**/*.{ts,tsx}",
   ],
```

---

## LOW Findings

### LOW-1: 30-Second Search Timeout Is Excessive
**File:** `app/api/search/route.ts:84-87`

Reduce from 30s to 10s for a UI-facing search endpoint.

### LOW-2: `rg` Binary Resolved via PATH
**File:** `app/api/search/route.ts:72`

Same PATH manipulation risk as HIGH-3 — prefer an absolute path.

### LOW-3: `counts` Object in Projects Route Uses 6 Separate Filter Passes
**File:** `app/api/projects/route.ts:51-58`

Single-pass counting is more efficient and less error-prone when new statuses are added.

```diff
--- a/app/api/projects/route.ts
+++ b/app/api/projects/route.ts
@@ -49,13 +49,9 @@ export async function GET(request: Request) {

     // Calculate counts from the already-processed list
-    const counts = {
-      active: projectsWithMetadata.filter((p) => p.status === 'active').length,
-      crawlers: projectsWithMetadata.filter((p) => p.status === 'crawlers').length,
-      research: projectsWithMetadata.filter((p) => p.status === 'research').length,
-      tools: projectsWithMetadata.filter((p) => p.status === 'tools').length,
-      icebox: projectsWithMetadata.filter((p) => p.status === 'icebox').length,
-      archived: projectsWithMetadata.filter((p) => p.status === 'archived').length,
-    };
+    const counts = Object.fromEntries(
+      ProjectStatusSchema.options.map((s) => [s, 0])
+    ) as Record<ProjectStatus, number>;
+    for (const p of projectsWithMetadata) counts[p.status]++;
```

### LOW-4: `useClickOutside` Hook Depends on `callback` Without Stable Reference Warning
**File:** `lib/hooks/useClickOutside.ts:15`

The hook's `useEffect` depends on `[ref, callback]`. If callers pass an unstable callback (not wrapped in `useCallback`), the effect re-runs on every render, adding/removing event listeners continuously.

### LOW-5: `secval.ts` DANGEROUS_KEYS Includes `'command'` — Conflicts with `TerminalCommandSchema`
**File:** `lib/chassis/secval.ts:12-28`

The `'command'` key is in `DANGEROUS_KEYS`, but `TerminalCommandSchema` has a `command` field. The terminal route already works around this by using `parseBody` instead of `parseSecureBody`, but this is fragile.

### LOW-6: `tsconfig.json` Target/Lib Mismatch
**File:** `tsconfig.json:3-6,29`

`target: "ES2017"` with `lib: ["esnext"]` — TypeScript allows ES2022+ APIs that won't be polyfilled.

### LOW-7: No Global Test Timeout in Vitest
**File:** `vitest.config.ts`

Future async tests could hang indefinitely.

### LOW-8: Zero Test Coverage for Security-Critical Paths
**File:** `tests/`

No tests for `validatePath`, `parseSecureBody`, `validateJSON`, `spawnGit`, `getCachedProjects`, or any API route handler. These are the first line of defense against malicious input.

### LOW-9: `generateStaticParams` Without `force-dynamic` on Status Page
**File:** `app/[status]/page.tsx:48-57`

If the page imports components that trigger API calls at build time, the build will fail in CI.

---

## Positive Observations

1. **`execFile`/`spawn` over `exec`** — No shell interpolation anywhere. Command injection is well-defended.
2. **`validatePath` with symlink resolution** — Path traversal defense is solid with `realpath()` checks.
3. **`secval` prototype pollution scanning** — JSON body parsing is defended against `__proto__` attacks.
4. **RFC 9457 Problem Details** — Error responses follow an industry standard with proper content types.
5. **5xx detail suppression** — Internal error messages are stripped before reaching the client.
6. **Bounded concurrency via `workMap`** — Git operations use semaphore-limited parallelism (3 workers).
7. **`spawnGit` timeout/size limits** — Git subprocess calls have 15s timeouts and output caps.
8. **Shared fetch coalescing in `useProjects`** — Prevents N-component thundering herd on mount.
9. **Terminal command whitelist** — Only explicitly allowed commands can be executed.
10. **Clean component architecture** — Proper separation of concerns, no `dangerouslySetInnerHTML`.

---

## Priority Fix Order

1. **CRIT-1** — Replace `process.exit(1)` with thrown error (stability)
2. **CRIT-2** — Validate slug parameter, add existence check in PATCH (security)
3. **HIGH-1** — Add CSP header, remove deprecated X-XSS-Protection (security)
4. **HIGH-2** — Fix NaN propagation in velocity/commits routes (correctness)
5. **HIGH-3** — Use absolute paths for `code`/`open` binaries (security)
6. **HIGH-4** — Cap `search` param length in projects route (DoS defense)
7. **HIGH-5/6** — Add max lengths to schemas (data integrity)
8. **MED-2** — Add `--fixed-strings` to rg invocation (security hardening)
9. **LOW-8** — Add tests for security-critical paths (long-term quality)
