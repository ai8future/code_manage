import { describe, it, expect } from 'vitest';
import {
  ProjectStatusSchema,
  UpdateProjectSchema,
  TerminalCommandSchema,
  MoveProjectSchema,
  CreateProjectSchema,
  SearchQuerySchema,
  DocFileSchema,
} from '@/lib/schemas';

describe('ProjectStatusSchema', () => {
  it('accepts valid statuses', () => {
    for (const status of ['active', 'crawlers', 'research', 'tools', 'icebox', 'archived']) {
      expect(ProjectStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects invalid status', () => {
    expect(() => ProjectStatusSchema.parse('unknown')).toThrow();
    expect(() => ProjectStatusSchema.parse('')).toThrow();
    expect(() => ProjectStatusSchema.parse(123)).toThrow();
  });
});

describe('UpdateProjectSchema', () => {
  it('accepts valid partial update', () => {
    const result = UpdateProjectSchema.parse({
      status: 'active',
      customName: 'My Project',
      starred: true,
    });
    expect(result.status).toBe('active');
    expect(result.customName).toBe('My Project');
    expect(result.starred).toBe(true);
  });

  it('accepts empty object (no fields to update)', () => {
    const result = UpdateProjectSchema.parse({});
    expect(result).toEqual({});
  });

  it('rejects invalid status in update', () => {
    expect(() =>
      UpdateProjectSchema.parse({ status: 'invalid' })
    ).toThrow();
  });

  it('rejects non-string customName', () => {
    expect(() =>
      UpdateProjectSchema.parse({ customName: 123 })
    ).toThrow();
  });

  it('rejects non-boolean starred', () => {
    expect(() =>
      UpdateProjectSchema.parse({ starred: 'yes' })
    ).toThrow();
  });

  it('rejects non-string-array tags', () => {
    expect(() =>
      UpdateProjectSchema.parse({ tags: [1, 2, 3] })
    ).toThrow();
  });

  it('accepts valid tags array', () => {
    const result = UpdateProjectSchema.parse({ tags: ['foo', 'bar'] });
    expect(result.tags).toEqual(['foo', 'bar']);
  });
});

describe('TerminalCommandSchema', () => {
  it('accepts valid command', () => {
    const result = TerminalCommandSchema.parse({ command: 'ls -la' });
    expect(result.command).toBe('ls -la');
    expect(result.cwd).toBeUndefined();
  });

  it('accepts command with cwd', () => {
    const result = TerminalCommandSchema.parse({ command: 'pwd', cwd: '/tmp' });
    expect(result.cwd).toBe('/tmp');
  });

  it('rejects empty command', () => {
    expect(() =>
      TerminalCommandSchema.parse({ command: '' })
    ).toThrow();
  });

  it('rejects missing command', () => {
    expect(() =>
      TerminalCommandSchema.parse({})
    ).toThrow();
  });
});

describe('MoveProjectSchema', () => {
  it('accepts valid move request', () => {
    const result = MoveProjectSchema.parse({
      slug: 'my-project',
      projectPath: '/code/my-project',
      newStatus: 'icebox',
    });
    expect(result.newStatus).toBe('icebox');
  });

  it('rejects invalid newStatus', () => {
    expect(() =>
      MoveProjectSchema.parse({
        slug: 'my-project',
        projectPath: '/code/my-project',
        newStatus: 'deleted',
      })
    ).toThrow();
  });

  it('rejects missing slug', () => {
    expect(() =>
      MoveProjectSchema.parse({
        projectPath: '/code/my-project',
        newStatus: 'active',
      })
    ).toThrow();
  });
});

describe('CreateProjectSchema', () => {
  it('accepts valid project creation', () => {
    const result = CreateProjectSchema.parse({
      name: 'my-project',
      description: 'A test project',
      category: 'active',
    });
    expect(result.name).toBe('my-project');
  });

  it('rejects uppercase project name', () => {
    expect(() =>
      CreateProjectSchema.parse({
        name: 'MyProject',
        description: 'A test',
        category: 'active',
      })
    ).toThrow();
  });

  it('rejects name starting with number', () => {
    expect(() =>
      CreateProjectSchema.parse({
        name: '1project',
        description: 'A test',
        category: 'active',
      })
    ).toThrow();
  });

  it('rejects name ending with hyphen', () => {
    expect(() =>
      CreateProjectSchema.parse({
        name: 'project-',
        description: 'A test',
        category: 'active',
      })
    ).toThrow();
  });

  it('accepts single letter name', () => {
    const result = CreateProjectSchema.parse({
      name: 'a',
      description: 'Single letter',
      category: 'tools',
    });
    expect(result.name).toBe('a');
  });

  it('rejects invalid category', () => {
    expect(() =>
      CreateProjectSchema.parse({
        name: 'my-project',
        description: 'A test',
        category: 'archived',
      })
    ).toThrow();
  });

  it('rejects empty description', () => {
    expect(() =>
      CreateProjectSchema.parse({
        name: 'my-project',
        description: '',
        category: 'active',
      })
    ).toThrow();
  });
});

describe('SearchQuerySchema', () => {
  it('accepts valid search query', () => {
    const result = SearchQuerySchema.parse({ q: 'hello world' });
    expect(result.q).toBe('hello world');
  });

  it('accepts query with limit', () => {
    const result = SearchQuerySchema.parse({ q: 'test', limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('rejects empty query', () => {
    expect(() =>
      SearchQuerySchema.parse({ q: '' })
    ).toThrow();
  });
});

describe('DocFileSchema', () => {
  it('accepts valid doc file body', () => {
    const result = DocFileSchema.parse({
      frontMatter: { title: 'Test' },
      content: '# Hello',
    });
    expect(result.content).toBe('# Hello');
  });

  it('accepts empty body', () => {
    const result = DocFileSchema.parse({});
    expect(result).toEqual({});
  });

  it('rejects non-string content', () => {
    expect(() =>
      DocFileSchema.parse({ content: 123 })
    ).toThrow();
  });
});
