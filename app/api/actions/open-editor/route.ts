import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Open in VS Code
    await execAsync(`code "${path}"`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to open in editor:', error);
    return NextResponse.json(
      { error: 'Failed to open in editor' },
      { status: 500 }
    );
  }
}
