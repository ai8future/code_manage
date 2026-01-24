import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json(
      { error: 'Path is required' },
      { status: 400 }
    );
  }

  // Security: only allow reading from _code directory
  if (!filePath.startsWith('/Users/cliff/Desktop/_code/')) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 403 }
    );
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 404 }
    );
  }
}
