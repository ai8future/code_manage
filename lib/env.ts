import { z } from 'zod';

const EnvSchema = z.object({
  CODE_BASE_PATH: z
    .string()
    .min(1, 'CODE_BASE_PATH must not be empty')
    .default('/Users/cliff/Desktop/_code'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

// Fail-fast: parse at module load time
export const env: Env = EnvSchema.parse({
  CODE_BASE_PATH: process.env.CODE_BASE_PATH ?? undefined,
  LOG_LEVEL: process.env.LOG_LEVEL ?? undefined,
  NODE_ENV: process.env.NODE_ENV ?? undefined,
});
