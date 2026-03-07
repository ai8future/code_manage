// XYOps operational visibility client via @ai8future/call
import { createClient } from '@ai8future/call';

export interface XyopsConfig {
  baseUrl: string;
  apiKey: string;
  serviceName: string;
  monitorEnabled: boolean;
  monitorInterval: number;
}

export class XyopsClient {
  private client = createClient({ timeout: 30_000 });

  constructor(private cfg: XyopsConfig) {}

  private async api(method: string, path: string, body?: unknown) {
    const url = `${this.cfg.baseUrl}${path}`;
    const resp = await this.client.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw new Error(`xyops: ${method} ${path}: HTTP ${resp.status}`);
    return resp.json();
  }

  async runEvent(eventId: string, params: Record<string, string>) {
    const result = await this.api('POST', `/api/events/${eventId}/run`, params);
    return (result as { job_id: string }).job_id;
  }

  async getJobStatus(jobId: string) {
    return this.api('GET', `/api/jobs/${jobId}`);
  }

  async cancelJob(jobId: string) {
    await this.api('POST', `/api/jobs/${jobId}/cancel`);
  }

  async listActiveAlerts() {
    return this.api('GET', '/api/alerts?state=firing');
  }

  async ackAlert(alertId: string) {
    await this.api('POST', `/api/alerts/${alertId}/ack`);
  }

  async ping() {
    await this.api('GET', '/api/ping');
  }

  /** Monitoring bridge — push health metrics on an interval. Use as a background task. */
  run(signal: AbortSignal): Promise<void> {
    if (!this.cfg.monitorEnabled) {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    }
    const interval = setInterval(async () => {
      try {
        const mem = process.memoryUsage();
        await this.api('POST', '/api/monitoring/push', {
          service: this.cfg.serviceName,
          metrics: {
            rss_bytes: mem.rss,
            heap_used_bytes: mem.heapUsed,
            uptime_seconds: Math.round(process.uptime()),
          },
        });
      } catch { /* call module logs errors internally */ }
    }, this.cfg.monitorInterval * 1000);
    return new Promise((resolve) => {
      signal.addEventListener('abort', () => { clearInterval(interval); resolve(); }, { once: true });
    });
  }
}
