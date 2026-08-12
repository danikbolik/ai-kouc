import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, streamText, tool } from 'ai';
import { z } from 'zod';

import { buildCoachNotesPromptSection } from '@/lib/coachNotesStore';
import { normalizePlannedWorkout, planItemsToCalendarActions } from '@/lib/calendarActions';
import { legacySessionsToDay } from '@/lib/dayData';
import { isPlaceholderApiKey } from '@/lib/resolveApiKeys';

import {
  buildChatUserPrompt,
  buildLlmSystemPrompt,
  buildRecalculateUserPrompt,
  enforceLockedSessions,
} from '@/lib/llm/prompts';
import { buildRecalculateRagContext } from '@/lib/ragKnowledge';
import { adaptTrainingPlan } from '@/lib/planAdaptation';
import {
  activityTypeSchema,
  chatResponseSchema,
  recalculateResponseSchema,
  workoutPlanItemSchema,
  workoutSessionSchema,
} from '@/lib/schemas/training';
import {
  CHAT_SYSTEM_PROMPT,
  RECALCULATE_SYSTEM_PROMPT,
  type RecalculateRequest,
  type RecalculateResponse,
  type WorkoutPlanItem,
} from '@/types/api';
import type { CoachNote, CoachNoteInput } from '@/types/coachNotes';
import type { DayData, WorkoutSession } from '@/types/training';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

type LlmRecalculateResponse = z.infer<typeof recalculateResponseSchema>;

function stripNull<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

function normalizeSession(session: z.infer<typeof workoutSessionSchema>): WorkoutSession {
  const bookRef = session.planned.bookReference;
  const hasBookRef =
    bookRef &&
    (bookRef.bookTitle?.trim() || bookRef.chapterOrPage?.trim() || bookRef.quote?.trim());

  return {
    id: session.id,
    phase: session.phase,
    title: session.title,
    type: session.type,
    isLocked: session.isLocked ?? false,
    planned: {
      description: session.planned.description ?? '',
      distanceKm: stripNull(session.planned.distanceKm),
      targetPace: stripNull(session.planned.targetPace),
      targetHR: stripNull(session.planned.targetHR),
      bookReference: hasBookRef
        ? {
            bookTitle: bookRef.bookTitle ?? '',
            chapterOrPage: bookRef.chapterOrPage ?? '',
            quote: bookRef.quote ?? '',
          }
        : undefined,
    },
    actual: session.actual
      ? {
          distanceKm: session.actual.distanceKm,
          durationMin: stripNull(session.actual.durationMin),
          avgPace: session.actual.avgPace,
          avgHR: session.actual.avgHR,
          garminSyncStatus: session.actual.garminSyncStatus,
          stravaActivityId: stripNull(session.actual.stravaActivityId),
          laps: session.actual.laps ?? undefined,
          hrZones: session.actual.hrZones ?? undefined,
        }
      : undefined,
  };
}

function normalizeUpdatedDays(
  days: LlmRecalculateResponse['updatedDays'],
): Record<string, DayData> {
  const result: Record<string, DayData> = {};

  for (const [date, day] of Object.entries(days)) {
    const feedback = day.feedback
      ? {
          rpe: stripNull(day.feedback.rpe),
          readinessScore: stripNull(day.feedback.readinessScore),
          sleepQuality: stripNull(day.feedback.sleepQuality),
          userComment: stripNull(day.feedback.userComment),
        }
      : undefined;

    if (day.plannedWorkouts && day.plannedWorkouts.length > 0) {
      result[date] = {
        date: day.date ?? date,
        activities: (day.activities ?? []).map((a) => ({
          ...a,
          stravaActivityId: stripNull(a.stravaActivityId),
          durationMin: stripNull(a.durationMin),
          laps: a.laps ?? undefined,
          hrZones: a.hrZones ?? undefined,
        })),
        plannedWorkouts: day.plannedWorkouts.map((w) => normalizePlannedWorkout(w)),
        feedback,
      };
      continue;
    }

    const sessions = day.sessions ?? [];
    result[date] = legacySessionsToDay(day.date ?? date, sessions.map(normalizeSession), feedback);
  }

  return result;
}

function createOpenAiModel(apiKey: string) {
  const provider = createOpenAI({ apiKey });
  return provider(DEFAULT_MODEL);
}

export function isOpenAiConfigured(apiKey?: string): boolean {
  const key = apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && !isPlaceholderApiKey(key));
}

export function parseOpenAiError(error: unknown): { message: string; status: number } {
  const err = error as Error & {
    statusCode?: number;
    lastError?: { message?: string };
    data?: { error?: { message?: string; code?: string; type?: string } };
  };

  const nestedMessage =
    err.data?.error?.message ??
    err.lastError?.message ??
    (error instanceof Error ? error.message : String(error));

  const combined = `${nestedMessage} ${err.message ?? ''}`.toLowerCase();
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o';

  if (
    combined.includes('incorrect api key') ||
    combined.includes('invalid api key') ||
    combined.includes('invalid_api_key') ||
    combined.includes('authentication') ||
    combined.includes('unauthorized') ||
    err.statusCode === 401
  ) {
    return {
      message:
        'Neplatný OpenAI API klíč. Zkontroluj OPENAI_API_KEY v .env.local nebo v Nastavení → Integrace / API.',
      status: 401,
    };
  }

  if (
    combined.includes('quota') ||
    combined.includes('billing') ||
    combined.includes('insufficient_quota') ||
    combined.includes('exceeded your current quota')
  ) {
    return {
      message:
        'Vyčerpaný kredit OpenAI (quota). Doplň kredit na https://platform.openai.com/account/billing',
      status: 402,
    };
  }

  if (
    combined.includes('model') &&
    (combined.includes('not found') ||
      combined.includes('does not exist') ||
      combined.includes('model_not_found'))
  ) {
    return {
      message: `Model „${model}" není dostupný nebo nemáš k němu přístup. Zkontroluj OPENAI_MODEL v .env.local.`,
      status: 400,
    };
  }

  if (combined.includes('rate limit') || combined.includes('429') || err.statusCode === 429) {
    return {
      message: 'Překročen rate limit OpenAI. Počkej chvíli a zkus to znovu.',
      status: 429,
    };
  }

  return {
    message: nestedMessage || 'OpenAI API vrátilo neznámou chybu.',
    status: err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500,
  };
}

export async function recalculateWithLlm(
  request: RecalculateRequest,
  methodicContext: string,
  apiKey: string,
): Promise<RecalculateResponse> {
  const { object } = await generateObject({
    model: createOpenAiModel(apiKey),
    schema: recalculateResponseSchema,
    system: buildLlmSystemPrompt(RECALCULATE_SYSTEM_PROMPT, methodicContext),
    prompt: buildRecalculateUserPrompt(request, methodicContext),
    temperature: 0.2,
  });

  const updatedDays = enforceLockedSessions(
    normalizeUpdatedDays(object.updatedDays),
    request.currentDays,
    request.lockedSessions,
  );

  return { updatedDays };
}

export function buildRecalculateMethodicContext(readinessScore: number): string {
  return buildRecalculateRagContext(readinessScore);
}

export function streamChatWithLlm(
  message: string,
  methodicContext: string,
  trainingLog: Parameters<typeof buildChatUserPrompt>[1],
  userMetrics: Parameters<typeof buildChatUserPrompt>[2],
  apiKey: string,
  visiblePeriod?: Parameters<typeof buildChatUserPrompt>[4],
) {
  return streamText({
    model: createOpenAiModel(apiKey),
    system: buildLlmSystemPrompt(CHAT_SYSTEM_PROMPT, methodicContext),
    prompt: buildChatUserPrompt(message, trainingLog, userMetrics, methodicContext, visiblePeriod),
    temperature: 0.2,
  });
}

export async function chatWithTools(
  message: string,
  methodicContext: string,
  trainingLog: Parameters<typeof buildChatUserPrompt>[1],
  userMetrics: Parameters<typeof buildChatUserPrompt>[2],
  apiKey: string,
  visiblePeriod?: Parameters<typeof buildChatUserPrompt>[4],
  coachNotes: CoachNote[] = [],
) {
  const coachNotesContext = buildCoachNotesPromptSection(coachNotes);

  const result = await generateText({
    model: createOpenAiModel(apiKey),
    system: buildLlmSystemPrompt(CHAT_SYSTEM_PROMPT, methodicContext, coachNotesContext),
    prompt: buildChatUserPrompt(message, trainingLog, userMetrics, methodicContext, visiblePeriod),
    tools: {
      create_workout_plan: tool({
        description:
          'Vloží plánované tréninky přímo do kalendáře sportovce. POVINNÉ při každém návrhu nebo úpravě tréninkového plánu – tréninky se automaticky synchronizují do kalendáře.',
        parameters: z.object({
          workouts: z.array(workoutPlanItemSchema).min(1),
        }),
        execute: async ({ workouts }) => ({ workouts }),
      }),
      save_coach_note: tool({
        description:
          'Použij tuto funkci, pokud uživatel v chatu zmíní důležitou dlouhodobou informaci o svém zdraví, zranění, časových možnostech, cílech nebo preferencích, kterou je potřeba si pamatovat pro budoucí tréninkové plány.',
        parameters: z.object({
          category: z.enum(['health', 'schedule', 'goal', 'preference', 'other']),
          text: z.string().min(1),
        }),
        execute: async ({ category, text }) => ({
          category,
          text: text.trim(),
          date: new Date().toISOString().slice(0, 10),
        }),
      }),
    },
    maxSteps: 5,
    temperature: 0.2,
  });

  let workoutPlan: WorkoutPlanItem[] = [];
  const savedCoachNotes: CoachNoteInput[] = [];

  for (const toolResult of result.toolResults) {
    if (toolResult.toolName === 'create_workout_plan') {
      const payload = toolResult.result as { workouts?: WorkoutPlanItem[] };
      workoutPlan = payload.workouts ?? [];
    }
    if (toolResult.toolName === 'save_coach_note') {
      const payload = toolResult.result as CoachNoteInput;
      if (payload.text?.trim()) {
        savedCoachNotes.push({
          category: payload.category,
          text: payload.text.trim(),
          date: payload.date,
        });
      }
    }
  }

  const calendarActions = planItemsToCalendarActions(workoutPlan);

  return {
    replyText: result.text,
    references: [] as { bookTitle: string; chapterOrPage: string; quote: string }[],
    workoutPlan,
    calendarActions,
    savedCoachNotes,
  };
}

export async function chatWithLlmStructured(
  message: string,
  methodicContext: string,
  trainingLog: Parameters<typeof buildChatUserPrompt>[1],
  userMetrics: Parameters<typeof buildChatUserPrompt>[2],
  apiKey: string,
  visiblePeriod?: Parameters<typeof buildChatUserPrompt>[4],
) {
  const { object } = await generateObject({
    model: createOpenAiModel(apiKey),
    schema: chatResponseSchema,
    system: `${buildLlmSystemPrompt(CHAT_SYSTEM_PROMPT, methodicContext)}

Vrať references POUZE z přiloženého metodického kontextu. Pokud kontext nestačí, references může být prázdné pole a replyText musí obsahovat větu o nedostatečných podkladech.
Pokud sportovec žádá úpravu plánu, vyplň calendarActions. Jinak vrať prázdné pole calendarActions.`,
    prompt: buildChatUserPrompt(message, trainingLog, userMetrics, methodicContext, visiblePeriod),
    temperature: 0.2,
  });

  return object;
}

export function recalculateWithMock(request: RecalculateRequest): RecalculateResponse {
  return adaptTrainingPlan(request);
}
