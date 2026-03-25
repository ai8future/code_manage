/**
 * Kafkakit event bus integration for code_manage.
 *
 * Publishes ai8.builder.code.scan.completed events when a project scan finishes.
 * Degrades gracefully if Kafka is not configured.
 */
import { createPublisher, type Publisher } from '@ai8future/kafkakit';

let _pub: Publisher | undefined;
let _initPromise: Promise<void> | undefined;

/** Initialize the kafkakit publisher if KAFKAKIT_BOOTSTRAP_SERVERS is set. */
export function initEventBus(): void {
  const bootstrapServers = process.env.KAFKAKIT_BOOTSTRAP_SERVERS;
  if (!bootstrapServers || _initPromise) return;

  _initPromise = createPublisher({
    bootstrapServers,
    schemaRegistryUrl: process.env.KAFKAKIT_SCHEMA_REGISTRY_URL ?? '',
    tenantId: process.env.KAFKAKIT_TENANT_ID ?? 'ai8',
    source: 'code_manage',
  })
    .then((p) => {
      _pub = p;
    })
    .catch(() => {
      // Degrade gracefully — service runs without event bus
    });
}

/**
 * Publish a scan.completed event.
 * Tolerates failures — never throws.
 */
export async function publishScanCompleted(data: {
  project_count: number;
  scan_duration_ms: number;
}): Promise<void> {
  if (!_pub) return;
  try {
    await _pub.publish('ai8.builder.code.scan.completed', data);
  } catch {
    // Event bus errors are non-fatal
  }
}

/** Close the publisher. Call on shutdown. */
export async function closeEventBus(): Promise<void> {
  if (_pub) {
    try {
      await _pub.close();
    } catch {
      /* best-effort */
    }
  }
}
