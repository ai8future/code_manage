import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// Whitelist of allowed commands to prevent arbitrary code execution
const ALLOWED_COMMANDS = new Set([
  'ls', 'pwd', 'cat', 'head', 'tail', 'wc',
  'git', 'npm', 'npx', 'yarn', 'pnpm', 'node',
  'grep', 'find', 'echo', 'date', 'which'
]);

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function POST(request: Request) {
  try {
    const { command, cwd } = await request.json();

    // Validate command is a non-empty string
    if (!command || typeof command !== 'string' || command.trim() === '') {
      return NextResponse.json(
        { error: 'Command is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate cwd is within CODE_BASE_PATH to prevent path traversal
    const resolvedCwd = path.resolve(cwd || CODE_BASE_PATH);
    if (!resolvedCwd.startsWith(CODE_BASE_PATH)) {
      return NextResponse.json(
        { error: 'Working directory must be within the code base path' },
        { status: 403 }
      );
    }

    // Parse command into base command and arguments
    const parts = command.trim().split(/\s+/);
    const baseCommand = parts[0];
    const args = parts.slice(1);

    // Check if command is in whitelist
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return NextResponse.json(
        { error: `Command '${baseCommand}' is not allowed` },
        { status: 403 }
      );
    }

    const result = await new Promise<CommandResult>((resolve) => {
      execFile(
        baseCommand,
        args,
        {
          cwd: resolvedCwd,
          maxBuffer: 1024 * 1024 * 10, // 10MB
          timeout: 60000, // 1 minute timeout
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            FORCE_COLOR: '1',
          },
        },
        (error, stdout, stderr) => {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: error ? 1 : 0,
          });
        }
      );
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Terminal error:', error);
    return NextResponse.json(
      { error: 'Failed to execute command' },
      { status: 500 }
    );
  }
}
