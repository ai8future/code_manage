import { z } from 'zod';

/** Valid project statuses */
export const ProjectStatusSchema = z.enum([
  'active', 'crawlers', 'research', 'tools', 'icebox', 'archived',
]);

/** PATCH /api/projects/[slug] */
export const UpdateProjectSchema = z.object({
  status: ProjectStatusSchema.optional(),
  customName: z.string().optional(),
  customDescription: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  starred: z.boolean().optional(),
});

/** POST /api/terminal */
export const TerminalCommandSchema = z.object({
  command: z.string().min(1, 'Command is required and must be a non-empty string'),
  cwd: z.string().optional(),
});

/** POST /api/actions/move */
export const MoveProjectSchema = z.object({
  slug: z.string().min(1, 'slug is required'),
  projectPath: z.string().min(1, 'projectPath is required'),
  newStatus: ProjectStatusSchema,
});

/** POST /api/projects/create */
export const CreateProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .regex(
      /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/,
      'Project name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens',
    ),
  description: z
    .string()
    .min(1, 'Description is required'),
  category: z.enum(['active', 'tools', 'research', 'crawlers'], {
    error: 'Invalid category. Must be one of: active, tools, research, crawlers',
  }),
});

/** GET /api/search query params */
export const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  limit: z.coerce.number().int().positive().optional(),
});

/** PUT /api/projects/docs/[filename] */
export const DocFileSchema = z.object({
  frontMatter: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
});
