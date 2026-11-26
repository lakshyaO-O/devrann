import { verifyAuth } from '@/lib/verify-auth';
import { enforceSharedRateLimit } from '@/lib/rate-limit'; import { enforceAiQuota, aiQuotaResponse } from '@/lib/ai-quota-server';

export async function POST(req: Request) {
  try {
    const auth = await verifyAuth(req);
    if (auth instanceof Response) return auth;
    const rateLimit = await enforceSharedRateLimit(auth.uid, 'ai.feed');
    if (rateLimit) return rateLimit;
    const quotaCheck = await enforceAiQuota(auth.uid, 'aiFeed');
    if (!quotaCheck.allowed) {
      return Response.json(aiQuotaResponse(quotaCheck, 'aiFeed'), { status: 429 });
    }
    const { userInterests, skillLevel, recentActivity } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({
        tips: [],
        recommendations: [],
      });
    }

    const { aiFeedGenerator } = await import('@/ai/flows/ai-feed-generator');
    const result = await aiFeedGenerator({ userInterests, skillLevel, recentActivity });
    return Response.json(result);
  } catch (error) {
    console.error('AI feed error:', error);
    return Response.json({
      tips: [],
      recommendations: [],
    });
  }
}
