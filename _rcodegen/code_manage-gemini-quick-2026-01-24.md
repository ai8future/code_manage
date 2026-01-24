Date Created: 2026-01-24 22:53:56
TOTAL_SCORE: 35/100

## 1. AUDIT

### Critical Security Vulnerability: Unrestricted Remote Code Execution
**Severity:** Critical
**File:** `app/api/terminal/route.ts`
**Description:** The API route accepts an arbitrary `command` string from the request body and passes it directly to `child_process.exec`. This allows any user with access to the API to execute arbitrary code on the server with the privileges of the node process.
**Remediation:** Remove this endpoint if possible. If shell access is required, implement a strict allowlist of commands and arguments, or use a pseudo-terminal (pty) library with proper authentication and isolation.

### Code Quality: Hardcoded Absolute Paths
**Severity:** High
**File:** `lib/scanner.ts`
**Description:** The application relies on a hardcoded system path `/Users/cliff/Desktop/_code`. This makes the application brittle and prevents it from running on other machines or environments without code changes.

## 2. TESTS

### Proposed Test: Tech Stack Detection
**File:** `lib/scanner.test.ts`
**Description:** Adds unit tests for the `detectTechStack` function to ensure it correctly identifies frameworks and languages.

```typescript
import { detectTechStack } from './scanner';
import path from 'path';

// Mock fs/promises
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
  },
}));

describe('detectTechStack', () => {
  const mockPath = '/mock/project/path';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should detect Next.js and TypeScript', async () => {
    const mockPackageJson = JSON.stringify({
      dependencies: {
        'next': '14.0.0',
        'react': '18.0.0'
      },
      devDependencies: {
        'typescript': '5.0.0'
      }
    });

    require('fs').promises.readFile.mockResolvedValue(mockPackageJson);
    
    const result = await detectTechStack(mockPath);
    
    expect(result).toContain('Next.js');
    expect(result).toContain('TypeScript');
    expect(result).toContain('React');
  });

  it('should detect Python/Django via requirements.txt', async () => {
    // Fail package.json check
    require('fs').promises.readFile.mockRejectedValueOnce(new Error('No file'));
    // Pass access check for requirements.txt
    require('fs').promises.access.mockResolvedValue(true);
    // Read requirements.txt
    require('fs').promises.readFile.mockResolvedValue('django==4.0.0\nrequests');

    const result = await detectTechStack(mockPath);
    
    expect(result).toContain('Python');
    expect(result).toContain('Django');
  });
});
```

## 3. FIXES

### Fix: Remove Hardcoded Paths and Fix Duplication
**Description:** Updates `lib/scanner.ts` to use `process.env.CODE_BASE_PATH` (falling back to the current hardcoded one for safety) and updates `app/api/actions/move/route.ts` to use the shared function instead of a duplicated hardcoded string.

#### `lib/scanner.ts`

```typescript
<<<<<<< SEARCH
const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

// Folders to completely ignore
=======
const CODE_BASE_PATH = process.env.CODE_BASE_PATH || '/Users/cliff/Desktop/_code';

// Folders to completely ignore
>>>>>>> REPLACE
```

#### `app/api/actions/move/route.ts`

```typescript
<<<<<<< SEARCH
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectStatus } from '@/lib/types';
import { setProjectMetadata } from '@/lib/config';

const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
=======
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectStatus } from '@/lib/types';
import { setProjectMetadata } from '@/lib/config';
import { getCodeBasePath } from '@/lib/scanner';

const CODE_BASE_PATH = getCodeBasePath();

const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
>>>>>>> REPLACE
```

## 4. REFACTOR

### 1. Centralized Configuration
Move `CODE_BASE_PATH`, `IGNORED_FOLDERS`, and `STATUS_FOLDERS` into `lib/config.ts` or `lib/constants.ts`. Currently, they are defined in `lib/scanner.ts` but `lib/config.ts` is named "config", creating confusion about where configuration lives.

### 2. Dependency Injection for Scanner
The `scanProject` and related functions in `lib/scanner.ts` rely on direct FS calls. Refactoring these to accept a file system interface would allow for much easier testing (avoiding the complex mocks shown in the TESTS section) and potentially allow scanning remote repositories or virtual file systems in the future.

### 3. API Route Error Handling Wrapper
Repeated try/catch blocks with console.error and generic 500 responses in API routes (`app/api/terminal/route.ts`, `app/api/actions/move/route.ts`, `app/api/projects/route.ts`) should be abstracted into a higher-order function or middleware to ensure consistent error reporting and reduce boilerplate.

```
