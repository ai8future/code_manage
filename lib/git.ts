import { spawn } from 'child_process';

export interface SpawnGitOptions {
  cwd: string;
  maxOutputSize?: number;
}

const DEFAULT_MAX_OUTPUT = 10 * 1024 * 1024; // 10MB

/**
 * Execute a git command using spawn (no shell).
 * Returns stdout as a string.
 */
export function spawnGit(
  args: string[],
  options: SpawnGitOptions
): Promise<string> {
  const { cwd, maxOutputSize = DEFAULT_MAX_OUTPUT } = options;

  return new Promise((resolve, reject) => {
    const git = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let stderr = '';

    git.stdout.on('data', (data) => {
      output += data.toString();
      if (output.length > maxOutputSize) {
        git.kill();
        reject(new Error('Git output exceeded maximum size'));
      }
    });

    git.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    git.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`git exited with code ${code}: ${stderr}`));
      }
    });

    git.on('error', (err) => {
      reject(err);
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
