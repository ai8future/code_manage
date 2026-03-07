// Feature flags via @ai8future/flagz — env var source with FLAG_ prefix
import { createFlags, fromEnv } from '@ai8future/flagz';

export const flags = createFlags(fromEnv('FLAG_'));
