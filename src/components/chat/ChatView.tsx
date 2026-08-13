'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { buildApiKeyHeaders } from '../../lib/apiKeyHeaders';
import { planItemsToCalendarActions } from '../../lib/calendarActions';
import { readPlainTextStream } from '../../lib/readPlainTextStream';
import { buildChatAiContext } from '../../lib/trainingHistoryContext';
import { CHAT_WELCOME_MESSAGE, useChatStore } from '../../store/useChatStore';
import { useTrainingStore } from '../../store/useTrainingStore';
import type { CalendarAction, ChatReference, WorkoutPlanItem } from '../../types/api';
import type { ChatMessage, DynamicReference } from '../../types/chat';

const SUGGESTED_PROMPTS = [
  'Proč mám na zítra naplánovaný prahový běh?',
  'Vyhodnoť můj poslední týden z pohledu únavy.',
  'Naplánuj mi na příští týden 4 běžecké dny podle metodiky.',
  'Jak mám upravit plán, pokud se cítím mírně nachlazený?',
];

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;

        if (line.startsWith('### ')) {
          return (
            <h3 key={i} className="text-sm font-bold text-slate-900">
              {renderInline(line.slice(4))}
            </h3>
          );
        }

        if (line.startsWith('> ')) {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-emerald-300 pl-3 italic text-slate-600"
            >
              {renderInline(line.slice(2))}
            </blockquote>
          );
        }

        if (line.startsWith('- ')) {
          return (
            <li key={i} className="ml-4 list-disc text-slate-700">
              {renderInline(line.slice(2))}
            </li>
          );
        }

        return (
          <p key={i} className="text-slate-700">
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

function AssistantMessageBody({ message }: { message: ChatMessage }) {
  const text = message.text.trim();

  if (message.isStreaming && !text) {
    return (
      <p className="flex items-center gap-2 text-sm italic text-slate-500">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:300ms]" />
        </span>
        AI trenér odpovídá…
      </p>
    );
  }

  if (!text) {
    return <p className="text-sm text-slate-500">Načítám odpověď…</p>;
  }

  return <MarkdownText text={message.text} />;
}

function ReferenceBadge({ reference }: { reference: NonNullable<ChatMessage['dynamicReferences']>[0] }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium',
        reference.type === 'book'
          ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
          : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
      ].join(' ')}
    >
      {reference.type === 'book' ? '📖' : '📅'} {reference.label}
    </span>
  );
}

function parseRagReferencesHeader(header: string | null): ChatReference[] {
  if (!header?.trim()) return [];

  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(header), (char) => char.charCodeAt(0)),
    );
    return JSON.parse(json) as ChatReference[];
  } catch {
    try {
      return JSON.parse(header) as ChatReference[];
    } catch {
      return [];
    }
  }
}
function calendarActionsToReferences(actions: CalendarAction[]): DynamicReference[] {
  return actions.flatMap((action) => {
    if (action.type === 'delete_session' || action.type === 'delete_planned_workout') {
      return [
        {
          type: 'workout' as const,
          label: `🗑️ Smazán trénink ${action.date}`,
          date: action.date,
        },
      ];
    }

    if (action.type === 'create_workout_plan') {
      return action.workouts.map((workout) => ({
        type: 'workout' as const,
        label: `📅 ${workout.date}: ${workout.title}`,
        date: workout.date,
        sessionTitle: workout.title,
      }));
    }

    if (action.type === 'upsert_planned_workout') {
      return [
        {
          type: 'workout' as const,
          label: `📅 ${action.date}: ${action.workout.title}`,
          date: action.date,
          sessionTitle: action.workout.title,
        },
      ];
    }

    return [
      {
        type: 'workout' as const,
        label: `📅 ${action.date}: ${action.session.title}`,
        date: action.date,
        sessionTitle: action.session.title,
      },
    ];
  });
}

function parseCalendarActionsHeader(header: string | null): CalendarAction[] {
  if (!header?.trim()) return [];

  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(header), (char) => char.charCodeAt(0)),
    );
    return JSON.parse(json) as CalendarAction[];
  } catch {
    try {
      return JSON.parse(header) as CalendarAction[];
    } catch {
      return [];
    }
  }
}

interface ChatResponsePayload {
  replyText: string;
  references: ChatReference[];
  calendarActions?: CalendarAction[];
  workoutPlan?: WorkoutPlanItem[];
  savedCoachNotes?: import('../../types/coachNotes').CoachNoteInput[];
}

function applyChatResponse(
  data: ChatResponsePayload,
  applyCalendarActions: (actions: CalendarAction[]) => void,
  addCoachNotesFromAi: (inputs: import('../../types/coachNotes').CoachNoteInput[]) => void,
  autoApply = true,
): {
  text: string;
  dynamicReferences: DynamicReference[];
  pendingWorkoutPlan?: WorkoutPlanItem[];
  planApplied: boolean;
} {
  const workoutPlan = data.workoutPlan ?? [];
  const savedCoachNotes = data.savedCoachNotes ?? [];
  const actions =
    (data.calendarActions?.length ? data.calendarActions : null) ??
    (workoutPlan.length > 0 ? planItemsToCalendarActions(workoutPlan) : []);
  let planApplied = false;

  if (autoApply && actions.length > 0) {
    applyCalendarActions(actions);
    planApplied = true;
  }

  if (autoApply && savedCoachNotes.length > 0) {
    addCoachNotesFromAi(savedCoachNotes);
  }

  const actionRefs = calendarActionsToReferences(actions);
  const bookRefs = referencesToDynamicReferences(data.references);

  let text = data.replyText;
  if (planApplied && actions.length > 0) {
    text += `\n\n✅ **Kalendář aktualizován** – ${actions.length} ${actions.length === 1 ? 'změna' : 'změny'}.`;
  }
  if (savedCoachNotes.length > 0) {
    text += `\n\n🧠 **Poznámka uložena do paměti trenéra** – ${savedCoachNotes.length} ${savedCoachNotes.length === 1 ? 'záznam' : 'záznamy'}.`;
  }

  return {
    text,
    dynamicReferences: [...bookRefs, ...actionRefs],
    pendingWorkoutPlan: planApplied ? undefined : workoutPlan.length > 0 ? workoutPlan : undefined,
    planApplied,
  };
}

function InsertPlanButton({
  messageId,
  plan,
  planApplied,
  onApply,
}: {
  messageId: string;
  plan: WorkoutPlanItem[];
  planApplied: boolean;
  onApply: (messageId: string, plan: WorkoutPlanItem[]) => void;
}) {
  if (plan.length === 0 || planApplied) return null;

  return (
    <button
      type="button"
      onClick={() => onApply(messageId, plan)}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
    >
      ➕ {planApplied ? 'Znovu vložit plán do kalendáře' : 'Vložit vygenerovaný plán do kalendáře'}
      <span className="text-xs font-normal text-emerald-600">({plan.length} tréninků)</span>
    </button>
  );
}

function referencesToDynamicReferences(references: ChatReference[]): DynamicReference[] {
  return references.map((ref) => ({
    type: 'book' as const,
    label: `Zdroj: ${ref.bookTitle.includes('Daniels') ? 'Daniels' : ref.bookTitle} ${ref.chapterOrPage}`,
    bookTitle: ref.bookTitle,
    chapterOrPage: ref.chapterOrPage,
    quote: ref.quote,
  }));
}

async function throwChatApiError(response: Response): Promise<never> {
  const errorText = await response.text();
  console.error('Detail chyby z AI API:', response.status, errorText);

  let message = `Chat API selhalo (${response.status})`;
  try {
    const parsed = JSON.parse(errorText) as { error?: string };
    if (parsed.error?.trim()) {
      message = parsed.error;
    } else if (errorText.trim()) {
      message = `Chat API selhalo (${response.status}): ${errorText}`;
    }
  } catch {
    if (errorText.trim()) {
      message = `Chat API selhalo (${response.status}): ${errorText}`;
    }
  }

  throw new Error(message);
}

export function ChatView() {
  const days = useTrainingStore((s) => s.days);
  const apiKeys = useTrainingStore((s) => s.apiKeys);
  const userMetrics = useTrainingStore((s) => s.userMetrics);
  const uploadedMethodology = useTrainingStore((s) => s.uploadedMethodology);
  const applyCalendarActions = useTrainingStore((s) => s.applyCalendarActions);
  const coachNotes = useTrainingStore((s) => s.coachNotes);
  const addCoachNotesFromAi = useTrainingStore((s) => s.addCoachNotesFromAi);

  const handleApplyWorkoutPlan = useCallback(
    (messageId: string, plan: WorkoutPlanItem[]) => {
      const actions = planItemsToCalendarActions(plan);
      applyCalendarActions(actions);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                planApplied: true,
                text: m.text.includes('Kalendář aktualizován')
                  ? m.text
                  : `${m.text}\n\n✅ **Kalendář aktualizován** – ${plan.length} ${plan.length === 1 ? 'trénink' : 'tréninků'}.`,
              }
            : m,
        ),
      );
    },
    [applyCalendarActions],
  );

  const messages = useChatStore((s) => s.messages);
  const setMessages = useChatStore((s) => s.setMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([CHAT_WELCOME_MESSAGE]);
    }
  }, [messages.length, setMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const {
          trainingLog,
          visiblePeriod,
          stravaHistorySummary,
          upcomingPlanSummary,
          planComparisonSummary,
        } = buildChatAiContext(days);

        const requestBody = {
          message: trimmed,
          userMetrics,
          trainingLog,
          uploadedMethodology,
          visiblePeriod,
          coachNotes,
          stravaHistorySummary,
          upcomingPlanSummary,
          planComparisonSummary,
        };

        const useStream = false;

        if (useStream) {
          const assistantId = `assistant-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              sender: 'assistant',
              text: '',
              isStreaming: true,
              timestamp: new Date().toISOString(),
            },
          ]);

          const response = await fetch('/api/chat?stream=true', {
            method: 'POST',
            headers: buildApiKeyHeaders(apiKeys),
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            await throwChatApiError(response);
          }

          const contentType = response.headers.get('content-type') ?? '';
          const referencesHeader = response.headers.get('X-RAG-References');
          const references = parseRagReferencesHeader(referencesHeader);

          if (contentType.includes('application/json')) {
            const data = (await response.json()) as ChatResponsePayload;
            const applied = applyChatResponse(data, applyCalendarActions, addCoachNotesFromAi);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: applied.text,
                      isStreaming: false,
                      dynamicReferences: applied.dynamicReferences,
                      pendingWorkoutPlan: applied.pendingWorkoutPlan,
                      planApplied: applied.planApplied,
                    }
                  : m,
              ),
            );
          } else {
            let accumulated = await readPlainTextStream(response, (partial) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, text: partial, isStreaming: true } : m,
                ),
              );
            });

            if (!accumulated.trim()) {
              const fallbackResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: buildApiKeyHeaders(apiKeys),
                body: JSON.stringify(requestBody),
              });

              if (fallbackResponse.ok) {
                const data = (await fallbackResponse.json()) as ChatResponsePayload;
                const applied = applyChatResponse(data, applyCalendarActions, addCoachNotesFromAi);
                accumulated = applied.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          text: applied.text,
                          isStreaming: false,
                          dynamicReferences: applied.dynamicReferences,
                          pendingWorkoutPlan: applied.pendingWorkoutPlan,
                          planApplied: applied.planApplied,
                        }
                      : m,
                  ),
                );
              } else {
                await throwChatApiError(fallbackResponse);
              }
            }

            if (accumulated.trim()) {
              const actionsHeader = response.headers.get('X-Calendar-Actions');
              const headerActions = parseCalendarActionsHeader(actionsHeader);
              if (headerActions.length > 0) {
                applyCalendarActions(headerActions);
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        text: accumulated,
                        isStreaming: false,
                        dynamicReferences: [
                          ...referencesToDynamicReferences(references),
                          ...calendarActionsToReferences(headerActions),
                        ],
                      }
                    : m,
                ),
              );
            }
          }
        } else {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: buildApiKeyHeaders(apiKeys),
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            await throwChatApiError(response);
          }

          const data = (await response.json()) as ChatResponsePayload;

          const applied = applyChatResponse(data, applyCalendarActions, addCoachNotesFromAi);

          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            sender: 'assistant',
            text: applied.text,
            timestamp: new Date().toISOString(),
            dynamicReferences: applied.dynamicReferences,
            pendingWorkoutPlan: applied.pendingWorkoutPlan,
            planApplied: applied.planApplied,
          };

          setMessages((prev) => [...prev, assistantMessage]);
        }
      } catch (error) {
        console.error('[ChatView]', error);
        const errorText =
          error instanceof Error ? error.message : 'Nepodařilo se získat odpověď od metodika.';

        setMessages((prev) => {
          const withoutEmptyAssistant = prev.filter(
            (m) => !(m.sender === 'assistant' && !m.text.trim() && m.id.startsWith('assistant-')),
          );

          return [
            ...withoutEmptyAssistant,
            {
              id: `error-${Date.now()}`,
              sender: 'assistant',
              text: `⚠️ **Chyba:** ${errorText}`,
              timestamp: new Date().toISOString(),
            },
          ];
        });
      } finally {
        setIsLoading(false);
      }
    },
    [days, isLoading, apiKeys, userMetrics, uploadedMethodology, coachNotes, applyCalendarActions, addCoachNotesFromAi, handleApplyWorkoutPlan],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Hlavička chatu */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aktivní metodický kontext
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-700">
          {uploadedMethodology.length > 0 ? (
            <>
              Nahrané podklady:{' '}
              <span className="font-medium">
                {uploadedMethodology.length}{' '}
                {uploadedMethodology.length === 1 ? 'dokument' : 'dokumenty'}
              </span>
              {' '}+ historie Strava (30 dní) a nadcházející plán (3 týdny)
            </>
          ) : (
            <>
              Načteno:{' '}
              <span className="font-medium">více metodických zdrojů</span>
              {' '}(Daniels, Canova, Bakken, Seiler, Uphill Athlete, nahrané podklady) + historie Strava (30 dní) a nadcházející plán
            </>
          )}
        </p>
      </div>

      {/* Oblast zpráv */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={[
                'flex',
                message.sender === 'user' ? 'justify-end' : 'justify-start',
              ].join(' ')}
            >
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-4 py-3',
                  message.sender === 'user'
                    ? 'rounded-br-md bg-slate-900 text-white'
                    : 'rounded-bl-md border border-slate-200 bg-white shadow-sm',
                ].join(' ')}
              >
                {message.sender === 'user' ? (
                  <p className="text-sm leading-relaxed">{message.text}</p>
                ) : (
                  <>
                    <AssistantMessageBody message={message} />
                    {message.dynamicReferences && message.dynamicReferences.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {message.dynamicReferences.map((ref, i) => (
                          <ReferenceBadge key={i} reference={ref} />
                        ))}
                      </div>
                    )}
                    {message.pendingWorkoutPlan && message.pendingWorkoutPlan.length > 0 && (
                      <InsertPlanButton
                        messageId={message.id}
                        plan={message.pendingWorkoutPlan}
                        planApplied={message.planApplied ?? false}
                        onApply={handleApplyWorkoutPlan}
                      />
                    )}
                  </>
                )}

                <p
                  className={[
                    'mt-2 text-[10px]',
                    message.sender === 'user' ? 'text-slate-400' : 'text-slate-400',
                  ].join(' ')}
                >
                  {new Date(message.timestamp).toLocaleTimeString('cs-CZ', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}

          {isLoading && !messages.some((m) => m.isStreaming) && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:300ms]" />
                  </span>
                  <span className="text-sm text-slate-500">
                    Metodik analyzuje data a knihy…
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Spodní panel – rychlé dotazy + input */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                disabled={isLoading}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Zeptej se metodika na trénink, plán nebo metodiku…"
              rows={1}
              disabled={isLoading}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              className="shrink-0 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              Odeslat
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            Enter pro odeslání · Shift+Enter pro nový řádek
          </p>
        </div>
      </div>
    </div>
  );
}
