import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { CODE_BASE_PATH } from '@/lib/constants';
import { createRequestLogger } from '@/lib/logger';
import { TerminalCommandSchema } from '@/lib/schemas';
import { parseBody } from '@/lib/api/validate';
import { validatePath } from '@/lib/api/pathSecurity';
import { validationError, forbiddenError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError, pathErrorResponse } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

// Whitelist of allowed commands to prevent arbitrary code execution
const ALLOWED_COMMANDS = new Set([
  'ls', 'pwd', 'cat', 'head', 'tail', 'wc',
  'git', 'npm', 'npx', 'yarn', 'pnpm', 'node',
  'grep', 'find', 'echo', 'date', 'which'
]);

// Dangerous arguments that could enable arbitrary code execution
const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-type', '-r', '--require']);
const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);

// Parse command string respecting quotes (handles "hello world" and 'hello world')
function parseCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

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

function validateCommandArgs(baseCommand: string, args: string[]): string | null {
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

  // Block npx with auto-install flags (could download malicious packages)
  if (baseCommand === 'npx') {
    for (const arg of args) {
      if (BLOCKED_NPX_ARGS.has(arg)) {
        return `npx argument '${arg}' is not allowed for security reasons`;
      }
    }
  }

  // Block yarn dlx (similar to npx)
  if (baseCommand === 'yarn' && args.length > 0 && args[0] === 'dlx') {
    return `yarn 'dlx' is not allowed for security reasons`;
  }

  // Block pnpm dlx (similar to npx)
  if (baseCommand === 'pnpm' && args.length > 0 && args[0] === 'dlx') {
    return `pnpm 'dlx' is not allowed for security reasons`;
  }

  return null; // No issues found
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function POST(request: Request) {
  const log = createRequestLogger('terminal', request);

  try {
    const rawBody = await request.text();
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch {
      return errorResponse(validationError('Invalid JSON'));
    }
    // parseBody (not parseSecureBody) — "command" is a secval v5 dangerous key,
    // but this endpoint intentionally accepts commands with its own whitelist guard.
    const parsed = parseBody(TerminalCommandSchema, body);
    if (!parsed.success) return parsed.response;
    const { command, cwd } = parsed.data;

    // Validate cwd is within CODE_BASE_PATH (with symlink protection)
    const cwdResult = await validatePath(cwd || CODE_BASE_PATH, { requireExists: false });
    if (!cwdResult.valid) {
      return pathErrorResponse('Working directory must be within the code base path', 403);
    }
    const resolvedCwd = cwdResult.resolvedPath;

    // Parse command into base command and arguments (respecting quotes)
    const parts = parseCommand(command.trim());
    if (parts.length === 0) {
      return errorResponse(validationError('Command is required'));
    }
    const baseCommand = parts[0];
    const args = parts.slice(1);

    // Check if command is in whitelist
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return errorResponse(
        forbiddenError(`Command '${baseCommand}' is not allowed`)
      );
    }

    // Validate arguments for potentially dangerous commands
    const argError = validateCommandArgs(baseCommand, args);
    if (argError) {
      return errorResponse(forbiddenError(argError));
    }

    const result = await new Promise<CommandResult>((resolve) => {
      execFile(
        baseCommand,
        args,
        {
          cwd: resolvedCwd,
          maxBuffer: 1024 * 1024 * 2, // 2MB (reduced from 10MB for security)
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
    log.error({ err: error }, 'Terminal error');
    return handleRouteError(error);
  }
}
