import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const rateCheck = checkRateLimit('anonymous', request, { windowMs: 60_000, maxRequests: 60 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const experienceLevel = searchParams.get('experienceLevel');
    const skills = searchParams.get('skills')?.split(',').filter(Boolean).slice(0, 10);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limitCount = 20;

    const db = getAdminFirestore();
    let query: FirebaseFirestore.Query = db.collection('careerListings')
      .where('category', '==', 'job')
      .orderBy('createdAt', 'desc');

    if (type) {
      query = query.where('type', '==', type);
    }
    if (experienceLevel) {
      query = query.where('experienceLevel', '==', experienceLevel);
    }
    if (skills && skills.length > 0) {
      query = query.where('skills', 'array-contains-any', skills);
    }

    const offset = (page - 1) * limitCount;
    const snap = await query.limit(limitCount).offset(offset).get();
    const listings = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ listings, page, hasMore: listings.length === limitCount });
  } catch (err: any) {
    console.error('[Career Listings GET] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
