Date Created: 2026-01-28 17:00:00
TOTAL_SCORE: 78/100

# AUDIT
### 1. Arbitrary File Read Protection (High Severity)
The `/api/file` endpoint allows reading any file within the `CODE_BASE_PATH`, potentially exposing sensitive configuration files like `.env` or `.git/config`.

**File:** `app/api/file/route.ts`

```typescript
<<<<<<< SEARCH
  // Security: Check real path to prevent symlink attacks
  try {
    const realPath = await fs.realpath(resolvedPath);
    if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
      return NextResponse.json(
        { error: 'Invalid path: symlink outside allowed directory' },
        { status: 403 }
      );
    }
  } catch {
    // File doesn't exist - will fail on read anyway
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
=======
  // Security: Check real path to prevent symlink attacks
  try {
    const realPath = await fs.realpath(resolvedPath);
    if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
      return NextResponse.json(
        { error: 'Invalid path: symlink outside allowed directory' },
        { status: 403 }
      );
    }
  } catch {
    // File doesn't exist - will fail on read anyway
  }

  // Security: Block access to sensitive files
  const filename = path.basename(resolvedPath);
  if (filename.startsWith('.env') || resolvedPath.includes('/.git/')) {
    return NextResponse.json(
      { error: 'Access denied to sensitive file' },
      { status: 403 }
    );
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
>>>>>>> REPLACE
```

# TESTS
### 1. Missing Tests for Tech Stack Detection
The `detectTechStack` function contains complex logic for identifying frameworks and languages but lacks unit tests.

**File:** `tests/lib/tech-stack.test.ts` (New File)

```typescript
<<<<<<< SEARCH
=======
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectTechStack } from '@/lib/scanner';
import { promises as fs } from 'fs';
import path from 'path';

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      access: vi.fn(),
    },
  };
});

describe('detectTechStack', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects Next.js, React, TypeScript, Tailwind', async () => {
    const mockPackageJson = JSON.stringify({
      dependencies: {
        'next': '14.0.0',
        'react': '18.0.0',
        'tailwindcss': '3.0.0'
      },
      devDependencies: {
        'typescript': '5.0.0'
      }
    });

    vi.mocked(fs.readFile).mockImplementation(async (pathStr) => {
      if (typeof pathStr === 'string' && pathStr.endsWith('package.json')) return mockPackageJson;
      throw new Error('File not found');
    });

    const techs = await detectTechStack('/test/project');
    expect(techs).toContain('Next.js');
    expect(techs).toContain('React');
    expect(techs).toContain('TypeScript');
    expect(techs).toContain('Tailwind');
  });

  it('detects Python/FastAPI via requirements.txt', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (pathStr) => {
      if (typeof pathStr === 'string' && pathStr.endsWith('package.json')) return '{}';
      if (typeof pathStr === 'string' && pathStr.endsWith('requirements.txt')) return 'fastapi==0.68.0\nuvicorn';
      throw new Error('File not found');
    });
    
    // Mock access for requirements.txt
    vi.mocked(fs.access).mockImplementation(async (pathStr) => {
      if (typeof pathStr === 'string' && pathStr.endsWith('requirements.txt')) return;
      throw new Error('File not found');
    });

    const techs = await detectTechStack('/test/project');
    expect(techs).toContain('Python');
    expect(techs).toContain('FastAPI');
  });

  it('defaults to Node.js if no specific framework found in package.json', async () => {
    vi.mocked(fs.readFile).mockImplementation(async (pathStr) => {
      if (typeof pathStr === 'string' && pathStr.endsWith('package.json')) return JSON.stringify({ dependencies: { 'lodash': '1.0.0' } });
      throw new Error('File not found');
    });

    const techs = await detectTechStack('/test/project');
    expect(techs).toEqual(['Node.js']);
  });
});
>>>>>>> REPLACE
```

# FIXES
### 1. Hardcoded User Path in Constants
The `CODE_BASE_PATH` defaults to a specific user's directory (`/Users/cliff/...`), making the code non-portable. It should default to a dynamic path or rely on the environment.

**File:** `lib/constants.ts`

```typescript
<<<<<<< SEARCH
import { ProjectStatus } from './types';

// Centralized configuration constants
export const CODE_BASE_PATH = process.env.CODE_BASE_PATH || '/Users/cliff/Desktop/_code';

// Status folder mappings: status → folder name (null for root level)
=======
import { ProjectStatus } from './types';
import path from 'path';

// Centralized configuration constants
export const CODE_BASE_PATH = process.env.CODE_BASE_PATH || path.join(process.env.HOME || process.cwd(), 'Desktop/_code');

// Status folder mappings: status → folder name (null for root level)
>>>>>>> REPLACE
```

# REFACTOR
### 1. Consolidate Path Validation
The path validation logic (checking `path.resolve`, `startsWith(CODE_BASE_PATH)`, and `fs.realpath`) is duplicated in:
- `app/api/file/route.ts`
- `app/api/actions/move/route.ts`
- `lib/api/createOpenActionRoute.ts`

**Recommendation:**
Extract this logic into a reusable function `validateProjectPath(inputPath: string): Promise<string>` in a new file `lib/security.ts`. This function should handle resolution, security checks (symlinks, traversal), and return the absolute path or throw a typed error.

```