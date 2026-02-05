Date Created: Wednesday, February 4, 2026 at 12:00:00 PM PST
TOTAL_SCORE: 83/100

## Executive Summary

The `code_manage` application demonstrates a solid architectural foundation using Next.js 14+ App Router. Security controls have been significantly hardened compared to previous audits (likely from `_rcodegen` history), specifically with the transition from `exec` to `execFile` and the implementation of command whitelisting.

However, the current security model relies on a custom, untested command parser (`parseCommand`) and a broad whitelist for `git` that could still allow command execution vectors. While the scanner logic is performant (non-recursive), the terminal API remains the primary risk surface.

## Detailed Findings

### 1. Security (Score: 35/40)
*   **Strengths:**
    *   **Path Validation:** `validatePath` in `lib/api/pathSecurity.ts` correctly handles symlink traversal attacks using `realpath`.
    *   **Execution Safety:** Transition to `execFile` prevents shell injection in most cases.
    *   **Whitelisting:** `ALLOWED_COMMANDS` and `BLOCKED_NPM_SUBCOMMANDS` provide a good first line of defense.
*   **Weaknesses:**
    *   **Fragile Parsing:** The custom `parseCommand` function in `app/api/terminal/route.ts` is manual and unverified. If it desynchronizes from how `execFile` interprets arguments, it could bypass the whitelist.
    *   **Git Command Risks:** Allowing `git` without restriction on subcommands (other than `cwd` validation) is risky. `git` has configuration flags (`-c`) that can execute commands.
    *   **Race Conditions:** `app/api/actions/move/route.ts` has a check-then-act race condition, though it attempts to handle `EEXIST` which mitigates the impact.

### 2. Architecture (Score: 25/30)
*   **Strengths:**
    *   **Scanner Performance:** `scanAllProjects` correctly limits recursion, avoiding infinite loops in `node_modules`.
    *   **Separation of Concerns:** Logic is well-segregated into `lib/` and `components/`.
*   **Weaknesses:**
    *   **Scalability:** `scanAllProjects` runs on every request to `/api/projects`. For a folder with thousands of projects, this will degrade.

### 3. Code Quality (Score: 18/20)
*   **Strengths:**
    *   Consistent TypeScript usage.
    *   Good error handling in API routes.
*   **Weaknesses:**
    *   Lack of specific unit tests for the critical security logic in the terminal route.

### 4. Testing (Score: 5/10)
*   **Weaknesses:**
    *   Tests exist but miss the most complex logic: the command parser.

## Recommendations & Fixes

1.  **Refactor Command Parsing:** Extract the fragile `parseCommand` and `validateCommandArgs` into a testable library `lib/terminal-utils.ts`.
2.  **Add Tests:** Add comprehensive unit tests for this new library.
3.  **Update Terminal Route:** Simplify the route handler by using the new library.

## Patch-Ready Diffs

### 1. New File: `lib/terminal-utils.ts`

```typescript
import { BLOCKED_NPM_SUBCOMMANDS } from './constants'; // You might need to move constants here or duplicate

const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-type', '-r', '--require']);
const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);

export function parseCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let escape = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

export function validateCommandArgs(baseCommand: string, args: string[]): string | null {
  // Block dangerous node arguments
  if (baseCommand === 'node') {
    for (const arg of args) {
      if (BLOCKED_NODE_ARGS.has(arg) || arg.startsWith('--eval=') || arg.startsWith('--require=')) {
        return `Argument '${arg}' is not allowed for security reasons`;
      }
    }
  }

  // Block dangerous npm subcommands
  if (baseCommand === 'npm' && args.length > 0) {
    const subcommand = args[0];
    if (BLOCKED_NPM_SUBCOMMANDS.has(subcommand)) {
      return `npm '${subcommand}' is not allowed for security reasons`;
    }
  }

  // Block npx with auto-install flags
  if (baseCommand === 'npx') {
    for (const arg of args) {
      if (BLOCKED_NPX_ARGS.has(arg)) {
        return `npx argument '${arg}' is not allowed for security reasons`;
      }
    }
  }

  // Block yarn dlx
  if (baseCommand === 'yarn' && args.length > 0 && args[0] === 'dlx') {
    return `yarn 'dlx' is not allowed for security reasons`;
  }

  // Block pnpm dlx
  if (baseCommand === 'pnpm' && args.length > 0 && args[0] === 'dlx') {
    return `pnpm 'dlx' is not allowed for security reasons`;
  }

  return null;
}
```

### 2. Update `app/api/terminal/route.ts`

```diff
--- app/api/terminal/route.ts
+++ app/api/terminal/route.ts
@@ -6,6 +6,7 @@
 import { TerminalCommandSchema } from '@/lib/schemas';
 import { parseBody } from '@/lib/api/validate';
 import { validatePath } from '@/lib/api/pathSecurity';
+import { parseCommand, validateCommandArgs } from '@/lib/terminal-utils';
 
 const log = createRouteLogger('terminal');
 
@@ -17,84 +18,6 @@
   'grep', 'find', 'echo', 'date', 'which'
 ]);
 
-// Dangerous arguments that could enable arbitrary code execution
-const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-type', '-r', '--require']);
-const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
-const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);
-
-// Parse command string respecting quotes (handles "hello world" and 'hello world')
-function parseCommand(command: string): string[] {
-  const parts: string[] = [];
-  let current = '';
-  let inQuote: string | null = null;
-
-  for (let i = 0; i < command.length; i++) {
-    const char = command[i];
-
-    if (inQuote) {
-      if (char === inQuote) {
-        inQuote = null;
-      } else {
-        current += char;
-      }
-    } else if (char === '"' || char === "'") {
-      inQuote = char;
-    } else if (char === ' ' || char === '\t') {
-      if (current) {
-        parts.push(current);
-        current = '';
-      }
-    } else {
-      current += char;
-    }
-  }
-
-  if (current) {
-    parts.push(current);
-  }
-
-  return parts;
-}
-
-function validateCommandArgs(baseCommand: string, args: string[]): string | null {
-  // Block dangerous node arguments
-  if (baseCommand === 'node') {
-    for (const arg of args) {
-      if (BLOCKED_NODE_ARGS.has(arg) || arg.startsWith('--eval=') || arg.startsWith('--require=')) {
-        return `Argument '${arg}' is not allowed for security reasons`;
-      }
-    }
-  }
-
-  // Block dangerous npm subcommands
-  if (baseCommand === 'npm' && args.length > 0) {
-    const subcommand = args[0];
-    if (BLOCKED_NPM_SUBCOMMANDS.has(subcommand)) {
-      return `npm '${subcommand}' is not allowed for security reasons`;
-    }
-  }
-
-  // Block npx with auto-install flags (could download malicious packages)
-  if (baseCommand === 'npx') {
-    for (const arg of args) {
-      if (BLOCKED_NPX_ARGS.has(arg)) {
-        return `npx argument '${arg}' is not allowed for security reasons`;
-      }
-    }
-  }
-
-  // Block yarn dlx (similar to npx)
-  if (baseCommand === 'yarn' && args.length > 0 && args[0] === 'dlx') {
-    return `yarn 'dlx' is not allowed for security reasons`;
-  }
-
-  // Block pnpm dlx (similar to npx)
-  if (baseCommand === 'pnpm' && args.length > 0 && args[0] === 'dlx') {
-    return `pnpm 'dlx' is not allowed for security reasons`;
-  }
-
-  return null; // No issues found
-}
-
 interface CommandResult {
   stdout: string;
   stderr: string;
```
}