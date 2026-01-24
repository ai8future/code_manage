import { NextResponse } from 'next/server';
import { exec } from 'child_process';

export const dynamic = 'force-dynamic';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function POST(request: Request) {
  try {
    const { command, cwd } = await request.json();

    if (!command) {
      return NextResponse.json(
        { error: 'Command is required' },
        { status: 400 }
      );
    }

    const result = await new Promise<CommandResult>((resolve) => {
      exec(
        command,
        {
          cwd: cwd || process.cwd(),
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
            exitCode: error?.code || 0,
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
