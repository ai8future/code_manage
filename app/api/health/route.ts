import { NextResponse } from 'next/server';
import { runAll, type Check } from '@ai8future/health';
import { takeHealthSnapshot } from '@/lib/diagnostics';

export const dynamic = 'force-dynamic';

const checks: Record<string, Check> = {
  process: async () => {
    const snapshot = takeHealthSnapshot();
    if (snapshot.rssMB > 1024) {
      throw new Error(`RSS too high: ${snapshot.rssMB}MB`);
    }
  },
};

export async function GET() {
  const { results, healthy } = await runAll(checks, AbortSignal.timeout(5000));
  return NextResponse.json(
    { status: healthy ? 'healthy' : 'unhealthy', checks: results },
    { status: healthy ? 200 : 503 }
  );
}
