'use client';

import { useEffect, useState } from 'react';

import { dayToLegacySessions, normalizeDayData } from '../../lib/dayData';
import {
  activityCardClassName,
  computeSessionMatchStatus,
  getMatchEmoji,
  getMatchIndicatorColors,
} from '../../lib/colors';
import { getTodayDate, getWeekdayShort } from '../../lib/dates';
import { useTrainingStore } from '../../store/useTrainingStore';
import { StravaActivityDetailTabs } from './StravaActivityDetails';
import type { WorkoutSession } from '../../types/training';

type DayTimeState = 'past' | 'today' | 'future';

function getDayTimeState(date: string, today: string): DayTimeState {
  if (date < today) return 'past';
  if (date === today) return 'today';
  return 'future';
}

function ComparisonRow({
  label,
  planned,
  actual,
}: {
  label: string;
  planned?: string | number;
  actual?: string | number;
}) {
  if (planned === undefined && actual === undefined) return null;

  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="text-slate-800">{planned ?? '—'}</span>
      <span className="text-slate-800">{actual ?? '—'}</span>
    </div>
  );
}

function SessionDetailSection({
  session,
  date,
  today,
}: {
  session: WorkoutSession;
  date: string;
  today: string;
}) {
  const toggleLockWorkout = useTrainingStore((s) => s.toggleLockWorkout);
  const timeState = getDayTimeState(date, today);
  const matchStatus = computeSessionMatchStatus(session, date, today);
  const matchColors = matchStatus ? getMatchIndicatorColors(matchStatus) : null;

  return (
    <div className={`rounded-xl border p-4 ${activityCardClassName(session.type)}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-white/70 px-2 py-0.5 text-xs font-bold uppercase">
              {session.phase}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">
              {session.type}
            </span>
            {session.isLocked && timeState === 'future' && (
              <span className="text-xs">🔒 Zamčeno</span>
            )}
          </div>
          <h3 className="mt-1 text-lg font-semibold">{session.title}</h3>
        </div>

        {matchStatus && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${matchColors?.background} ${matchColors?.text}`}
          >
            {getMatchEmoji(matchStatus)}{' '}
            {matchStatus === 'match'
              ? 'Splněno'
              : matchStatus === 'partial'
                ? 'Odchylka'
                : 'Nesplněno'}
          </span>
        )}

        {timeState === 'future' && (
          <button
            type="button"
            onClick={() => toggleLockWorkout(date, session.id)}
            className="rounded-lg border border-current/20 bg-white/60 px-3 py-1.5 text-xs font-semibold hover:bg-white/80"
          >
            {session.isLocked ? '🔒 Odemknout' : '🔓 Zamknout'}
          </button>
        )}
      </div>

      <p className="mb-4 text-sm leading-relaxed opacity-90">{session.planned.description}</p>

      <StravaActivityDetailTabs
        laps={session.actual?.laps}
        hrZones={session.actual?.hrZones}
        overview={
          <div className="rounded-lg bg-white/60 p-3">
            <div className="mb-2 grid grid-cols-3 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Metrika</span>
              <span>Plán</span>
              <span>Realita</span>
            </div>

            <ComparisonRow
              label="Vzdálenost"
              planned={
                session.planned.distanceKm !== undefined
                  ? `${session.planned.distanceKm} km`
                  : undefined
              }
              actual={
                session.actual
                  ? session.actual.distanceKm > 0
                    ? `${session.actual.distanceKm} km`
                    : '—'
                  : undefined
              }
            />
            <ComparisonRow
              label="Čas"
              actual={
                session.actual?.durationMin && session.actual.durationMin > 0
                  ? `${session.actual.durationMin} min`
                  : undefined
              }
            />
            <ComparisonRow
              label="Tempo"
              planned={session.planned.targetPace}
              actual={session.actual?.avgPace}
            />
            <ComparisonRow
              label="Tepová frekvence"
              planned={session.planned.targetHR}
              actual={session.actual?.avgHR}
            />

            {session.actual && (
              <p className="mt-2 text-xs text-slate-500">
                Strava sync:{' '}
                <span
                  className={
                    session.actual.garminSyncStatus === 'synced'
                      ? 'font-medium text-emerald-600'
                      : 'font-medium text-amber-600'
                  }
                >
                  {session.actual.garminSyncStatus === 'synced'
                    ? 'Synchronizováno'
                    : 'Čeká na sync'}
                </span>
              </p>
            )}
          </div>
        }
      />

      {/* Citace z knihy */}
      {session.planned.bookReference && (
        <blockquote className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              📖 {session.planned.bookReference.bookTitle}
            </span>
            <span className="text-xs text-amber-700">
              {session.planned.bookReference.chapterOrPage}
            </span>
          </div>
          <p className="text-sm italic leading-relaxed text-amber-900">
            „{session.planned.bookReference.quote}"
          </p>
        </blockquote>
      )}
    </div>
  );
}

export function WorkoutDetailModal() {
  const isOpen = useTrainingStore((s) => s.isDetailModalOpen);
  const selectedDate = useTrainingStore((s) => s.selectedDate);
  const selectedSessionId = useTrainingStore((s) => s.selectedSessionId);
  const days = useTrainingStore((s) => s.days);
  const closeDetailModal = useTrainingStore((s) => s.closeDetailModal);
  const updateFeedback = useTrainingStore((s) => s.updateFeedback);
  const recalculatePlan = useTrainingStore((s) => s.recalculatePlan);
  const isRecalculating = useTrainingStore((s) => s.isRecalculating);

  const today = getTodayDate();
  const dayData = days[selectedDate];
  const sessions = dayData ? dayToLegacySessions(normalizeDayData(dayData)) : [];
  const timeState = getDayTimeState(selectedDate, today);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [readinessScore, setReadinessScore] = useState(5);
  const [userComment, setUserComment] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const initialSessionId =
      selectedSessionId ?? sessions[0]?.id ?? null;
    setActiveSessionId(initialSessionId);

    setReadinessScore(dayData?.feedback?.readinessScore ?? 5);
    setUserComment(dayData?.feedback?.userComment ?? '');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetailModal();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, selectedDate, selectedSessionId, dayData, sessions, closeDetailModal]);

  if (!isOpen) return null;

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const showReadiness = timeState === 'today';
  const showCommentFeedback = timeState === 'past' || timeState === 'today';
  const showRecalculate = showReadiness && readinessScore >= 8;

  const handleSaveFeedback = () => {
    updateFeedback(selectedDate, {
      readinessScore: showReadiness ? readinessScore : dayData?.feedback?.readinessScore,
      userComment: userComment || undefined,
    });
    closeDetailModal();
  };

  const handleRecalculate = async () => {
    updateFeedback(selectedDate, { readinessScore });
    await recalculatePlan(selectedDate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Zavřít detail"
        onClick={closeDetailModal}
      />

      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-detail-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="workout-detail-title" className="text-lg font-semibold text-slate-900">
              Detail tréninku
            </h2>
            <p className="text-sm text-slate-500">
              {getWeekdayShort(selectedDate)} {selectedDate}
              {timeState === 'today' && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Dnes
                </span>
              )}
              {timeState === 'past' && (
                <span className="ml-2 text-xs text-slate-400">Minulost</span>
              )}
              {timeState === 'future' && (
                <span className="ml-2 text-xs text-slate-400">Budoucnost</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={closeDetailModal}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>

        {/* Session tabs */}
        {sessions.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-5 py-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveSessionId(session.id)}
                className={[
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeSessionId === session.id
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                    : 'text-slate-500 hover:bg-slate-50',
                ].join(' ')}
              >
                {session.phase} – {session.title}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Sekce 1: Detail & Srovnání */}
          {activeSession ? (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Detail tréninku &amp; srovnání
              </h3>
              <SessionDetailSection session={activeSession} date={selectedDate} today={today} />
            </section>
          ) : (
            <p className="text-center text-sm text-slate-400">Pro tento den není naplánován trénink.</p>
          )}

          {/* Sekce 2: Ranní Check-in */}
          {showReadiness && (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ranní check-in připravenosti
              </h3>

              <div className="space-y-5">
                <label className="block">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Ranní únava</span>
                    <span className="text-sm font-bold text-slate-900">{readinessScore}/10</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={readinessScore}
                    onChange={(e) => setReadinessScore(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-emerald-600"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>1 – Svěží</span>
                    <span>10 – Vyčerpaný</span>
                  </div>
                </label>

                {showRecalculate && (
                  <button
                    type="button"
                    onClick={handleRecalculate}
                    disabled={isRecalculating}
                    className="w-full rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-60"
                  >
                    {isRecalculating
                      ? '⏳ Přepočítávám plán…'
                      : '⚡ Přepočítat nadcházející dny podle metodiky'}
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Sekce 3: Komentář */}
          {showCommentFeedback && (
            <section className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Zpětná vazba k tréninku
              </h3>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Komentář</span>
                <textarea
                  value={userComment}
                  onChange={(e) => setUserComment(e.target.value)}
                  rows={3}
                  placeholder='Např. "Cítil jsem zatuhlé achilovky"'
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2"
                />
              </label>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                closeDetailModal();
                useTrainingStore.getState().openEditModal(selectedDate);
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Přidat trénink
            </button>
            {activeSession && (
              <button
                type="button"
                onClick={() => {
                  closeDetailModal();
                  useTrainingStore.getState().openEditModal(selectedDate, activeSession.id);
                }}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                ✏️ Upravit plán
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeDetailModal}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Zavřít
            </button>
            {(showReadiness || showCommentFeedback) && (
              <button
                type="button"
                onClick={handleSaveFeedback}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Uložit feedback
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
