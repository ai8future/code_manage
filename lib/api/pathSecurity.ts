import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

type PathValid = { valid: true; resolvedPath: string };
type PathInvalid = { valid: false; error: string; status: number };
export type PathValidationResult = PathValid | PathInvalid;

/**
 * Validate that a path is within CODE_BASE_PATH and not a symlink escape.
 * Resolves the path, checks the prefix, and verifies realpath.
 *
 * @param inputPath - The raw path string from the request
 * @param opts.requireExists - If true (default), return 404 when path doesn't exist.
 *                             If false, allow non-existent paths (for file creation).
 */
export async function validatePath(
  inputPath: string,
  opts: { requireExists?: boolean } = {},
): Promise<PathValidationResult> {
  const { requireExists = true } = opts;
  const resolvedPath = path.resolve(inputPath);

  // Check resolved path is within CODE_BASE_PATH
  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/') && resolvedPath !== CODE_BASE_PATH) {
    return { valid: false, error: 'Invalid path', status: 403 };
  }

  // Check realpath to prevent symlink attacks
  try {
    const realPath = await fs.realpath(resolvedPath);
    if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
      return { valid: false, error: 'Invalid path: symlink outside allowed directory', status: 403 };
    }
    return { valid: true, resolvedPath: realPath };
  } catch {
    if (requireExists) {
      return { valid: false, error: 'Path does not exist', status: 404 };
    }
    // Path doesn't exist yet (for new files) - use the resolved path
    return { valid: true, resolvedPath };
  }
}
