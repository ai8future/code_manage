import { z } from 'zod';
import { requireMajor } from '@ai8future/chassis';
import { mustLoad } from '@ai8future/config';

requireMajor(8);

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
  xyopsBaseUrl: z.string().default(''),
  xyopsApiKey: z.string().default(''),
  xyopsServiceName: z.string().default('code_manage'),
  xyopsMonitorEnabled: z.coerce.boolean().default(false),
  xyopsMonitorInterval: z.coerce.number().default(30),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = mustLoad({
  schema: EnvSchema,
  env: {
    codeBasePath: 'CODE_BASE_PATH',
    logLevel: 'LOG_LEVEL',
    nodeEnv: 'NODE_ENV',
    xyopsBaseUrl: 'XYOPS_BASE_URL',
    xyopsApiKey: 'XYOPS_API_KEY',
    xyopsServiceName: 'XYOPS_SERVICE_NAME',
    xyopsMonitorEnabled: 'XYOPS_MONITOR_ENABLED',
    xyopsMonitorInterval: 'XYOPS_MONITOR_INTERVAL',
  },
});

/** Build XyopsConfig from flat env vars */
export function getXyopsConfig() {
  return {
    baseUrl: env.xyopsBaseUrl,
    apiKey: env.xyopsApiKey,
    serviceName: env.xyopsServiceName,
    monitorEnabled: env.xyopsMonitorEnabled,
    monitorInterval: env.xyopsMonitorInterval,
  };
}
