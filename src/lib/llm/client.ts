import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
import { enrichReplyWithWorkoutPlanFormat } from '@/lib/workoutPlanChatFormat';
import { buildAiContextSummaries } from '@/lib/trainingHistoryContext';
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
  type CalendarAction,
  type RecalculateRequest,
  type RecalculateResponse,
  type WorkoutPlanItem,
} from '@/types/api';
import type { CoachNote, CoachNoteInput } from '@/types/coachNotes';
import type { DayData, WorkoutSession } from '@/types/training';

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

export type ChatLlmProvider = 'gemini' | 'openai';

export interface ChatLlmCallOptions {
  provider?: ChatLlmProvider;
  systemMethodologyContext?: string;
  uploadedMethodologyContext?: string;
  chatHistory?: { role: 'user' | 'assistant'; content: string }[];
}

type LlmRecalculateResponse = z.infer<typeof recalculateResponseSchema>;

const updateCalendarWorkoutItemSchema = workoutPlanItemSchema.extend({
  coachReasoning: z
    .string()
    .min(20)
    .describe(
      'Odůvodnění trenéra pro chat: proč je trénink takto nastaven, jak navazuje na předchozí dny, fyziologické riziko nebo přínos',
    ),
});

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
          readinessScore: stripNull(day.feedback.readinessScore),
          userComment: stripNull(day.feedback.userComment),
        }
      : undefined;

    if (day.plannedWorkouts && day.plannedWorkouts.length > 0) {
      result[date] = {
        date: day.date ?? date,
        activities: (day.activities ?? []).map((a) => ({
          ...a,
          stravaActivityId: stripNull(a.stravaActivityId),
          stravaStartAt: stripNull(a.stravaStartAt),
          notes: stripNull(a.notes),
          durationMin: stripNull(a.durationMin),
          elevationGainM: stripNull(a.elevationGainM),
          tss: stripNull(a.tss),
          gapPace: stripNull(a.gapPace),
          terrainType: stripNull(a.terrainType),
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
  return provider(DEFAULT_OPENAI_MODEL);
}

function createGeminiModel(apiKey: string) {
  const google = createGoogleGenerativeAI({ apiKey });
  return google(DEFAULT_GEMINI_MODEL);
}

function createChatModel(apiKey: string, provider: ChatLlmProvider) {
  return provider === 'gemini' ? createGeminiModel(apiKey) : createOpenAiModel(apiKey);
}

export function isGeminiConfigured(apiKey?: string): boolean {
  const key = apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && !isPlaceholderApiKey(key));
}

export function resolveChatLlmProvider(
  geminiKey?: string,
  openAiKey?: string,
): { provider: ChatLlmProvider; apiKey: string } | null {
  if (geminiKey && isGeminiConfigured(geminiKey)) {
    return { provider: 'gemini', apiKey: geminiKey };
  }
  if (openAiKey && isOpenAiConfigured(openAiKey)) {
    return { provider: 'openai', apiKey: openAiKey };
  }
  return null;
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
    system: buildLlmSystemPrompt(RECALCULATE_SYSTEM_PROMPT, {
      methodicRagContext: methodicContext,
    }),
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
  trainingLog: Parameters<typeof buildChatUserPrompt>[1],
  userMetrics: Parameters<typeof buildChatUserPrompt>[2],
  apiKey: string,
  visiblePeriod?: Parameters<typeof buildChatUserPrompt>[3],
  allTrainingDays?: Record<string, import('@/types/training').DayData>,
  options?: ChatLlmCallOptions,
) {
  const daysRecord =
    allTrainingDays ??
    Object.fromEntries((trainingLog ?? []).map((day) => [day.date, day]));
  const provider = options?.provider ?? 'openai';
  return streamText({
    model: createChatModel(apiKey, provider),
    system: buildLlmSystemPrompt(CHAT_SYSTEM_PROMPT, {
      systemMethodologyContext: options?.systemMethodologyContext,
      uploadedMethodologyContext: options?.uploadedMethodologyContext,
    }),
    prompt: buildChatUserPrompt(
      message,
      trainingLog,
      userMetrics,
      visiblePeriod,
      Object.keys(daysRecord).length
        ? buildAiContextSummaries(daysRecord, userMetrics)
        : undefined,
      options?.chatHistory,
    ),
    temperature: 0.2,
  });
}

export async function chatWithTools(
  message: string,
  trainingLog: Parameters<typeof buildChatUserPrompt>[1],
  userMetrics: Parameters<typeof buildChatUserPrompt>[2],
  apiKey: string,
  visiblePeriod?: Parameters<typeof buildChatUserPrompt>[3],
  coachNotes: CoachNote[] = [],
  allTrainingDays?: Record<string, import('@/types/training').DayData>,
  options?: ChatLlmCallOptions,
) {
  const coachNotesContext = buildCoachNotesPromptSection(coachNotes);
  const daysRecord =
    allTrainingDays ??
    Object.fromEntries((trainingLog ?? []).map((day) => [day.date, day]));
  const historySummaries = Object.keys(daysRecord).length
    ? buildAiContextSummaries(daysRecord, userMetrics)
    : undefined;
  const provider = options?.provider ?? 'openai';

  const result = await generateText({
    model: createChatModel(apiKey, provider),
    system: buildLlmSystemPrompt(CHAT_SYSTEM_PROMPT, {
      coachNotesContext,
      systemMethodologyContext: options?.systemMethodologyContext,
      uploadedMethodologyContext: options?.uploadedMethodologyContext,
    }),
    prompt: buildChatUserPrompt(
      message,
      trainingLog,
      userMetrics,
      visiblePeriod,
      historySummaries,
      options?.chatHistory,
    ),
    tools: {
      update_calendar_workouts: tool({
        description:
          'Zapíše nebo OPRAVÍ plánované tréninky v kalendáři (function calling). POVINNÉ při generování/korekci plánu. Pošli VŠECHNY dotčené dny najednou. U každého tréninku vyplň coachReasoning (zobrazí se v chatu). V replyText u každého dne uveď: 📅 Datum – název | Parametry | Odůvodnění trenéra. U intervalů/tempa/závodů vyplň warmUp/coolDown. U závodů raceDetails.',
        parameters: z.object({
          workouts: z.array(updateCalendarWorkoutItemSchema).min(1),
        }),
        execute: async ({ workouts }) => ({ workouts }),
      }),
      delete_planned_workouts: tool({
        description:
          'Smaže plánované tréninky z kalendáře. Použij při kompenzační úpravě mikrocyklu. V replyText vysvětli proč byl trénink zrušen. Lze kombinovat s update_calendar_workouts.',
        parameters: z.object({
          deletions: z
            .array(
              z.object({
                date: z.string(),
                workoutId: z.string(),
              }),
            )
            .min(1),
        }),
        execute: async ({ deletions }) => ({ deletions }),
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
  const calendarActions: CalendarAction[] = [];
  const savedCoachNotes: CoachNoteInput[] = [];

  for (const toolResult of result.toolResults) {
    if (toolResult.toolName === 'update_calendar_workouts') {
      const payload = toolResult.result as { workouts?: WorkoutPlanItem[] };
      const workouts = payload.workouts ?? [];
      workoutPlan = workouts;
      calendarActions.push(...planItemsToCalendarActions(workouts));
    }
    if (toolResult.toolName === 'delete_planned_workouts') {
      const payload = toolResult.result as {
        deletions?: { date: string; workoutId: string }[];
      };
      for (const deletion of payload.deletions ?? []) {
        calendarActions.push({
          type: 'delete_planned_workout',
          date: deletion.date,
          workoutId: deletion.workoutId,
        });
      }
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

  const replyText = enrichReplyWithWorkoutPlanFormat(result.text, workoutPlan);

  return {
    replyText,
    references: [] as { bookTitle: string; chapterOrPage: string; quote: string }[],
    workoutPlan,
    calendarActions,
    savedCoachNotes,
  };
}

export async function chatWithLlmStructured(
  message: string,
  trainingLog: Parameters<typeof buildChatUserPrompt>[1],
  userMetrics: Parameters<typeof buildChatUserPrompt>[2],
  apiKey: string,
  visiblePeriod?: Parameters<typeof buildChatUserPrompt>[3],
  allTrainingDays?: Record<string, import('@/types/training').DayData>,
  options?: ChatLlmCallOptions,
) {
  const daysRecord =
    allTrainingDays ??
    Object.fromEntries((trainingLog ?? []).map((day) => [day.date, day]));
  const { object } = await generateObject({
    model: createOpenAiModel(apiKey),
    schema: chatResponseSchema,
    system: `${buildLlmSystemPrompt(CHAT_SYSTEM_PROMPT, {
      systemMethodologyContext: options?.systemMethodologyContext,
      uploadedMethodologyContext: options?.uploadedMethodologyContext,
    })}

Vrať references POUZE z metodického kontextu v system promptu. Pokud kontext nestačí, references může být prázdné pole a replyText musí obsahovat větu o nedostatečných podkladech.
Pokud sportovec žádá úpravu plánu, vyplň calendarActions. Jinak vrať prázdné pole calendarActions.`,
    prompt: buildChatUserPrompt(
      message,
      trainingLog,
      userMetrics,
      visiblePeriod,
      Object.keys(daysRecord).length
        ? buildAiContextSummaries(daysRecord, userMetrics)
        : undefined,
      options?.chatHistory,
    ),
    temperature: 0.2,
  });

  return object;
}

export function recalculateWithMock(request: RecalculateRequest): RecalculateResponse {
  return adaptTrainingPlan(request);
}
