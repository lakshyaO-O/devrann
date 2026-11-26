import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

interface QueuedAction {
  id: string;
  type: string;
  payload: any;
  timestamp: string;
  retries: number;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const limited = await enforceSharedRateLimit(decodedToken.uid, 'offline-sync', {
      windowMs: 60_000,
      maxRequests: 20,
    });
    if (limited) return limited;

    const action: QueuedAction = await request.json();
    const { type, payload } = action;

    switch (type) {
      case 'SUBMIT_CODE': {
        const battleId = payload?.battleId;
        const code = payload?.code;
        if (typeof battleId !== 'string' || !battleId.trim() || typeof code !== 'string' || code.length > 100000) {
          return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }
        const res = await fetch(`${request.nextUrl.origin}/api/battles/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ battleId, code }),
        });
        const data = await res.text();
        return new NextResponse(data, {
          status: res.status,
          headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
        });
      }
      default:
        return NextResponse.json({ error: `Unknown action type: ${type}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[Offline Sync] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
