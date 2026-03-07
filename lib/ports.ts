// Adapted from @ai8future/chassis v6 — deterministic port derivation using djb2 hashing

const MIN_PORT = 5000;
const MAX_PORT = 48000;

/** Standard port offset constants. */
export const PORT_HTTP = 0;
export const PORT_GRPC = 1;
export const PORT_METRICS = 2;

/**
 * djb2 hash — fast, deterministic string hash.
 */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Derive a stable, deterministic port from a service name using djb2 hashing.
 * The result is in the range 5000–48000, safely below the OS ephemeral range.
 *
 * Use offset constants (PORT_HTTP, PORT_GRPC, PORT_METRICS) or raw numbers
 * for additional ports (3, 4, ...).
 *
 * @param serviceName - Unique service identifier (e.g. "serp_svc")
 * @param offset - Port offset (default 0 = PORT_HTTP)
 */
export function port(serviceName: string, offset: number = PORT_HTTP): number {
  const hash = djb2(serviceName);
  const span = MAX_PORT - MIN_PORT + 1;
  const base = MIN_PORT + (hash % span);
  return base + offset;
}

/**
 * Get port configuration constants.
 */
export function getPortConfig() {
  return { MIN_PORT, MAX_PORT };
}
