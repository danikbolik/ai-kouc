import { NextResponse } from 'next/server';

import {
  chatWithTools,
  isOpenAiConfigured,
  parseOpenAiError,
  streamChatWithLlm,
} from '@/lib/llm/client';
import { buildMethodicContext } from '@/lib/methodologyContext';
import { getMethodologyContext } from '@/lib/getMethodologyContext';
import { chunksToReferences, CHAT_RAG_TOP_K, searchKnowledge } from '@/lib/ragKnowledge';
import { resolveOpenAiKey } from '@/lib/resolveApiKeys';
import type { ChatRequest } from '@/types/api';
import type { DayData } from '@/types/training';

function normalizeTrainingLog(trainingLog?: DayData[]) {
  if (!trainingLog || trainingLog.length === 0) {
    return [];
  }
  return [...trainingLog].sort((a, b) => a.date.localeCompare(b.date));
}

function missingApiKeyResponse() {
  return NextResponse.json(
    {
      error:
        'Chybí OPENAI_API_KEY v .env.local. Přidej platný klíč nebo ho ulož v Nastavení → Integrace / API.',
    },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const url = new URL(request.url);
    const stream = url.searchParams.get('stream') === 'true';
    const openAiKey = resolveOpenAiKey(request);

    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'Missing required field: message' }, { status: 400 });
    }

    if (!isOpenAiConfigured(openAiKey) || !openAiKey) {
      return missingApiKeyResponse();
    }

    const trainingLog = normalizeTrainingLog(body.trainingLog);
    const visiblePeriod = body.visiblePeriod;

    const methodicContext = buildMethodicContext({
      localMethodologyContext: await getMethodologyContext(),
      uploadedMethodology: body.uploadedMethodology,
      query: body.message,
      includeFullLibrary: true,
    });

    const ragReferences = chunksToReferences(searchKnowledge(body.message, CHAT_RAG_TOP_K));

    try {
      if (stream) {
        const result = streamChatWithLlm(
          body.message,
          methodicContext,
          trainingLog,
          body.userMetrics,
          openAiKey,
          visiblePeriod,
          body.allTrainingDays,
        );

        const ragReferencesJson = JSON.stringify(ragReferences);
        const encodedReferences = Buffer.from(ragReferencesJson, 'utf-8').toString('base64');

        const textStream = result.textStream;
        const streamBody = new ReadableStream<Uint8Array>({
          async start(controller) {
            const encoder = new TextEncoder();
            let hadContent = false;

            try {
              for await (const chunk of textStream) {
                if (chunk) {
                  hadContent = true;
                  controller.enqueue(encoder.encode(chunk));
                }
              }

              const fullText = await result.text;
              if (!fullText.trim() && !hadContent) {
                controller.enqueue(
                  encoder.encode(
                    '⚠️ OpenAI nevrátilo odpověď. Zkontroluj OPENAI_API_KEY v .env.local nebo v Nastavení → Integrace / API.',
                  ),
                );
              }
              controller.close();
            } catch (streamError) {
              const { message } = parseOpenAiError(streamError);
              console.error('[API /chat] Stream error:', streamError);
              controller.enqueue(encoder.encode(`⚠️ ${message}`));
              controller.close();
            }
          },
        });

        return new Response(streamBody, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-RAG-References': encodedReferences,
            'X-RAG-References-Encoding': 'base64',
            'X-Chat-Mode': 'stream',
          },
        });
      }

      const llmResult = await chatWithTools(
        body.message,
        methodicContext,
        trainingLog,
        body.userMetrics,
        openAiKey,
        visiblePeriod,
        body.coachNotes ?? [],
        body.allTrainingDays,
      );

      const mergedReferences = [...llmResult.references];
      for (const ref of ragReferences) {
        if (!mergedReferences.some((r) => r.chapterOrPage === ref.chapterOrPage)) {
          mergedReferences.push(ref);
        }
      }

      const calendarActionsJson = JSON.stringify(llmResult.calendarActions ?? []);
      const encodedActions = Buffer.from(calendarActionsJson, 'utf-8').toString('base64');

      return NextResponse.json({
        replyText: llmResult.replyText,
        references: mergedReferences.slice(0, CHAT_RAG_TOP_K),
        calendarActions: llmResult.calendarActions ?? [],
        workoutPlan: llmResult.workoutPlan ?? [],
        savedCoachNotes: llmResult.savedCoachNotes ?? [],
      }, {
        headers: {
          'X-Calendar-Actions': encodedActions,
          'X-Calendar-Actions-Encoding': 'base64',
        },
      });
    } catch (openAiError) {
      const { message, status } = parseOpenAiError(openAiError);
      console.error('[API /chat] OpenAI error:', openAiError);
      return NextResponse.json({ error: message }, { status });
    }
  } catch (error) {
    console.error('[API /chat]', error);
    const message =
      error instanceof Error ? error.message : 'Nepodařilo se vygenerovat odpověď chatu.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
