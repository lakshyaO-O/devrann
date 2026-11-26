import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const rateCheck = checkRateLimit('anonymous', request, { windowMs: 60_000, maxRequests: 20 });
  if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs);

  const code = request.nextUrl.searchParams.get('code') || 'unknown';
  const safeCode = /^[a-z0-9_\-./]+$/i.test(code) ? code.slice(0, 64) : 'invalid';
  console.warn('[Google popup] rejected:', safeCode);
  return NextResponse.json({ ok: true });
}