import { spawn } from 'child_process';

export interface SpawnGitOptions {
  cwd: string;
  maxOutputSize?: number;
  /** Kill the process after this many ms. Default: 30 000 (30s). */
  timeoutMs?: number;
}

const DEFAULT_MAX_OUTPUT = 5 * 1024 * 1024; // 5MB (down from 10MB)
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Execute a git command using spawn (no shell).
 * Returns stdout as a string.
 * Includes per-process timeout and output size limits.
 */
export function spawnGit(
  args: string[],
  options: SpawnGitOptions
): Promise<string> {
  const {
    cwd,
    maxOutputSize = DEFAULT_MAX_OUTPUT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    const git = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Array-based buffering to avoid O(n^2) string concatenation
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let stderr = '';

    const timer = setTimeout(() => {
      git.kill('SIGKILL');
      settle(() => reject(new Error(`git timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    git.stdout.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxOutputSize) {
        git.kill();
        settle(() => reject(new Error('Git output exceeded maximum size')));
        return;
      }
      chunks.push(chunk);
    });

    git.stderr.on('data', (data: Buffer) => {
      // Cap stderr accumulation to prevent memory issues
      if (stderr.length < 4096) {
        stderr += data.toString();
      }
    });

    git.on('close', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString();
      settle(() => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`git exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });
    });

    git.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(err));
    });
  });
}

/**
 * Parse git numstat output line.
 * Returns { added, removed } or null if not a numstat line.
 */
export function parseNumstatLine(line: string): { added: number; removed: number } | null {
  const match = line.match(/^(\d+|-)\t(\d+|-)\t/);
  if (!match) return null;

  return {
    added: match[1] === '-' ? 0 : parseInt(match[1], 10),
    removed: match[2] === '-' ? 0 : parseInt(match[2], 10),
  };
}
