import { NextResponse } from 'next/server';

import {
  formatLlmValidationError,
  isLlmSchemaValidationError,
} from '@/lib/llm/errors';
import {
  isOpenAiConfigured,
  recalculateWithLlm,
  recalculateWithMock,
} from '@/lib/llm/client';
import { buildMethodicContext } from '@/lib/methodologyContext';
import { getMethodologyContext } from '@/lib/getMethodologyContext';
import { resolveOpenAiKey } from '@/lib/resolveApiKeys';
import type { RecalculateRequest } from '@/types/api';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecalculateRequest;
    const apiKey = resolveOpenAiKey(request);

    if (!body.fromDate || body.readinessScore === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: fromDate, readinessScore' },
        { status: 400 },
      );
    }

    if (!body.historySummary?.length) {
      return NextResponse.json(
        { error: 'Missing required field: historySummary (14 dní kalendáře)' },
        { status: 400 },
      );
    }

    if (!body.userMetrics) {
      return NextResponse.json(
        { error: 'Missing required field: userMetrics' },
        { status: 400 },
      );
    }

    const methodicContext = buildMethodicContext({
      localMethodologyContext: await getMethodologyContext(),
      uploadedMethodology: body.uploadedMethodology,
      readinessScore: body.readinessScore,
    });

    if (isOpenAiConfigured(apiKey) && apiKey) {
      try {
        const result = await recalculateWithLlm(body, methodicContext, apiKey);
        return NextResponse.json(result);
      } catch (error) {
        if (isLlmSchemaValidationError(error)) {
          const validationError = formatLlmValidationError(error);
          console.error('[API /recalculate] LLM schema validation failed:', error);

          const fallback = recalculateWithMock(body);
          return NextResponse.json({
            ...fallback,
            warning:
              'LLM odpověď neprošla validací schématu, použit lokální algoritmus adaptace.',
            validationError,
          });
        }
        throw error;
      }
    }

    const result = recalculateWithMock(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /recalculate]', error);
    const message =
      error instanceof Error ? error.message : 'Failed to recalculate plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
