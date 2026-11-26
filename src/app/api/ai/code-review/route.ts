import { verifyAuth } from '@/lib/verify-auth';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import { enforceAiQuota, aiQuotaResponse } from '@/lib/ai-quota-server';

const MAX_CODE_LENGTH = 100_000;
const SUPPORTED_LANGUAGES = new Set(['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust']);

export async function POST(req: Request) {
  try {
    const auth = await verifyAuth(req);
    if (auth instanceof Response) return auth;
    const rateLimit = await enforceSharedRateLimit(auth.uid, 'ai.code-review');
    if (rateLimit) return rateLimit;
    const quotaCheck = await enforceAiQuota(auth.uid, 'aiCodeReview');
    if (!quotaCheck.allowed) {
      return Response.json(aiQuotaResponse(quotaCheck, 'aiCodeReview'), { status: 429 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.code !== 'string' || !body.code.trim()) {
      return Response.json({ error: 'Code is required' }, { status: 400 });
    }
    if (body.code.length > MAX_CODE_LENGTH) {
      return Response.json({ error: `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters.` }, { status: 400 });
    }
    const language = typeof body.language === 'string' ? body.language : 'javascript';
    if (!SUPPORTED_LANGUAGES.has(language)) {
      return Response.json({ error: 'Unsupported programming language.' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: 'AI code review is not configured.' }, { status: 503 });
    }

    const { codeReviewAssistant } = await import('@/ai/flows/code-review-assistant-flow');
    const result = await codeReviewAssistant({ code: body.code, language });
    if (!result.review.trim()) {
      return Response.json({ error: 'The AI provider returned an empty review.' }, { status: 502 });
    }
    return Response.json(result);
  } catch (error) {
    console.error('AI code review error:', error);
    return Response.json({ error: 'AI code review is temporarily unavailable.' }, { status: 502 });
  }
}
