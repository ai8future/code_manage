import { createHash } from 'crypto';

const MIN_PORT = 5000;
const MAX_PORT = 49000;

/**
 * Calculate a deterministic port number from a directory name using MD5.
 * This ensures each project gets a consistent, unique-ish port.
 *
 * Formula:
 *   hash = MD5(directoryName)
 *   checksum = first 4 bytes as unsigned 32-bit integer (big-endian)
 *   port = MIN_PORT + (checksum % (MAX_PORT - MIN_PORT + 1))
 */
export function getPortFromDirectory(directoryName: string): number {
  const hash = createHash('md5').update(directoryName).digest();
  const checksum = hash.readUInt32BE(0);
  const span = MAX_PORT - MIN_PORT + 1;
  const offset = checksum % span;
  return MIN_PORT + offset;
}

/**
 * Get port configuration constants
 */
export function getPortConfig() {
  return { MIN_PORT, MAX_PORT };
}
