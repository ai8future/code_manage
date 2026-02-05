import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { CODE_BASE_PATH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

interface DocFile {
  filename: string;
  title: string;
  description?: string;
  preview?: string;
  date?: string;
  source?: 'project' | 'vault';
  vaultPath?: string; // Full path to vault directory for this doc
}

// Files to ignore
const IGNORED_FILES = new Set(['README.md', 'readme.md', 'Readme.md', 'CHANGELOG.md', 'changelog.md', 'LICENSE.md', 'AGENTS.md']);

function extractPreview(content: string, maxLength: number = 150): string {
  // Skip headings, images, badges, and empty lines to find first paragraph
  const lines = content.split('\n');
  let preview = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('![')) continue;
    if (trimmed.startsWith('[')) continue;
    if (trimmed.startsWith('---')) continue;
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) continue; // Skip bold-only lines like **Source:**
    if (trimmed.startsWith('|')) continue; // Skip tables

    preview = trimmed;
    break;
  }

  if (preview.length > maxLength) {
    return preview.slice(0, maxLength).trim() + '...';
  }
  return preview;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  // Validate path is within CODE_BASE_PATH
  const resolvedPath = path.resolve(projectPath);
  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
  if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  // Helper function to scan a directory for markdown files
  async function scanDirectory(dirPath: string, source: 'project' | 'vault', vaultPath?: string): Promise<DocFile[]> {
    const docs: DocFile[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.md')) continue;
        if (IGNORED_FILES.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;

        const filePath = path.join(dirPath, entry.name);

        try {
          const rawContent = await fs.readFile(filePath, 'utf-8');
          const { data, content } = matter(rawContent);

          // Get title from front-matter, or derive from filename
          let title = data.title;
          if (!title) {
            // Convert filename to title: "my-document.md" -> "My Document"
            title = entry.name
              .replace('.md', '')
              .replace(/[-_]/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase());
          }

          // Get preview: use description if available, otherwise extract from content
          const preview = data.description || extractPreview(content);

          // Format date nicely
          let dateStr: string | undefined;
          if (data.date) {
            const d = new Date(data.date);
            if (!isNaN(d.getTime())) {
              dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
            } else {
              dateStr = String(data.date);
            }
          }

          docs.push({
            filename: entry.name,
            title,
            description: data.description,
            preview,
            date: dateStr,
            source,
            vaultPath: source === 'vault' ? vaultPath : undefined,
          });
        } catch {
          // Skip files that can't be read
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return docs;
  }

  try {
    // Scan project directory
    const projectDocs = await scanDirectory(resolvedPath, 'project');

    // Determine the vault path for this project
    // Project path: /Users/cliff/Desktop/_code/my_project or /Users/cliff/Desktop/_code/_icebox/my_project
    // Vault path: /Users/cliff/Desktop/_code/__VAULT/my_project
    const projectName = path.basename(resolvedPath);
    const vaultDir = path.join(CODE_BASE_PATH, '__VAULT', projectName);

    // Scan vault directory
    const vaultDocs = await scanDirectory(vaultDir, 'vault', vaultDir);

    // Combine and sort all docs
    const docs = [...projectDocs, ...vaultDocs];

    docs.sort((a, b) => {
      // Sort vault docs after project docs within the same date
      if (a.date && b.date) {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
      }
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      // If same date or both no date, sort by source (project first) then title
      if (a.source !== b.source) {
        return a.source === 'project' ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });

    return NextResponse.json({ docs });
  } catch {
    return NextResponse.json({ docs: [] });
  }
}
