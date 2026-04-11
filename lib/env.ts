import { z } from 'zod';
import { requireMajor } from '@ai8future/chassis';
import { mustLoad } from '@ai8future/config';

requireMajor(11);

const EnvSchema = z.object({
  codeBasePath: z
    .string()
    .min(1, { error: 'CODE_BASE_PATH must not be empty' })
    .default('/Users/cliff/Desktop/_code'),
  logLevel: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  nodeEnv: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = mustLoad({
  schema: EnvSchema,
  env: {
    codeBasePath: 'CODE_BASE_PATH',
    logLevel: 'LOG_LEVEL',
    nodeEnv: 'NODE_ENV',
  },
});
