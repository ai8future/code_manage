import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { createRequestLogger } from '@/lib/logger';
import { DocFileSchema } from '@/lib/schemas';
import { parseSecureBody } from '@/lib/api/validate';
import { validatePath } from '@/lib/api/pathSecurity';
import { validationError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError, pathErrorResponse } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ filename: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const log = createRequestLogger('projects/docs/[filename]', request);
  const { filename } = await params;
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return errorResponse(validationError('Path is required'));
  }

  if (!filename) {
    return errorResponse(validationError('Filename is required'));
  }

  // Validate filename (prevent directory traversal)
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return errorResponse(validationError('Invalid filename'));
  }

  const validation = await validatePath(projectPath, { requireExists: false });
  if (!validation.valid) {
    return pathErrorResponse(validation.error, validation.status);
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
    return handleRouteError(err);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const log = createRequestLogger('projects/docs/[filename]', request);
  const { filename } = await params;
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return errorResponse(validationError('Path is required'));
  }

  if (!filename) {
    return errorResponse(validationError('Filename is required'));
  }

  // Validate filename (prevent directory traversal)
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return errorResponse(validationError('Invalid filename'));
  }

  const validation = await validatePath(projectPath, { requireExists: false });
  if (!validation.valid) {
    return pathErrorResponse(validation.error, validation.status);
  }

  const filePath = path.join(validation.resolvedPath, filename);

  try {
    const rawBody = await request.text();
    const parsed = parseSecureBody(DocFileSchema, rawBody);
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
    return handleRouteError(err);
  }
}
