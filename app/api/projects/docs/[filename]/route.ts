import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { createRouteLogger } from '@/lib/logger';
import { DocFileSchema } from '@/lib/schemas';
import { parseBody } from '@/lib/api/validate';
import { validatePath } from '@/lib/api/pathSecurity';

const log = createRouteLogger('projects/docs/[filename]');

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ filename: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { filename } = await params;
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  }

  // Validate filename (prevent directory traversal)
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const validation = await validatePath(projectPath, { requireExists: false });
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const filePath = path.join(validation.resolvedPath, filename);

  try {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    const { data: frontMatter, content } = matter(rawContent);

    return NextResponse.json({
      filename,
      frontMatter,
      content,
      rawContent,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist - return empty content for new files
      return NextResponse.json({
        filename,
        frontMatter: {},
        content: '',
        rawContent: '',
        isNew: true,
      });
    }
    log.error({ err }, 'Error reading doc file');
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { filename } = await params;
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  }

  // Validate filename (prevent directory traversal)
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const validation = await validatePath(projectPath, { requireExists: false });
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const filePath = path.join(validation.resolvedPath, filename);

  try {
    const body = await request.json();
    const parsed = parseBody(DocFileSchema, body);
    if (!parsed.success) return parsed.response;
    const { frontMatter, content } = parsed.data;

    // Build the file content with front-matter
    let fileContent: string;
    if (frontMatter && Object.keys(frontMatter).length > 0) {
      fileContent = matter.stringify(content || '', frontMatter);
    } else {
      fileContent = content || '';
    }

    await fs.writeFile(filePath, fileContent, 'utf-8');

    return NextResponse.json({ success: true, filename });
  } catch (err) {
    log.error({ err }, 'Error writing doc file');
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
