import { NextResponse } from 'next/server';
import { takeHealthSnapshot, inflightRequests } from '@/lib/diagnostics';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = takeHealthSnapshot();
  const inflight = Array.from(inflightRequests.entries()).map(([key, entry]) => ({
    key,
    route: entry.route,
    requestId: entry.requestId,
    durationMs: Date.now() - entry.startedAt,
  }));

  return NextResponse.json({ snapshot, inflight });
}
