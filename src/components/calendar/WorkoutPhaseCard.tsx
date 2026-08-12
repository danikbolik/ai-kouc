'use client';

import {
  activityCardClassName,
  computeSessionMatchStatus,
  getMatchEmoji,
  getMatchIndicatorColors,
} from '../../lib/colors';
import { getTodayDate } from '../../lib/dates';
import { useTrainingStore } from '../../store/useTrainingStore';
import type { WorkoutSession } from '../../types/training';

interface WorkoutPhaseCardProps {
  date: string;
  session: WorkoutSession;
  onOpenDetail?: (sessionId: string) => void;
}

function formatPlanned(session: WorkoutSession): string {
  const parts: string[] = [];
  if (session.planned.distanceKm !== undefined) {
    parts.push(`${session.planned.distanceKm} km`);
  }
  if (session.planned.targetPace) {
    parts.push(`@${session.planned.targetPace}`);
  }
  if (session.planned.targetHR) {
    parts.push(`${session.planned.targetHR} TF`);
  }
  return parts.length > 0 ? parts.join(' ') : session.planned.description.slice(0, 40);
}

function formatActual(session: WorkoutSession): string | null {
  if (!session.actual) return null;
  if (session.actual.distanceKm === 0) return 'Dokončeno';
  const parts = [`${session.actual.distanceKm} km`, `@${session.actual.avgPace}`];
  if (session.actual.durationMin && session.actual.durationMin > 0) {
    const hours = Math.floor(session.actual.durationMin / 60);
    const minutes = session.actual.durationMin % 60;
    parts.push(hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`);
  }
  if (session.actual.avgHR > 0) parts.push(`${session.actual.avgHR} TF`);
  return parts.join(' ');
}

function bookBadgeLabel(session: WorkoutSession): string | null {
  const ref = session.planned.bookReference;
  if (!ref) return null;

  const shortTitle = ref.bookTitle.includes('Daniels')
    ? 'Daniels'
    : ref.bookTitle.split(' ')[0];

  const pageMatch = ref.chapterOrPage.match(/s\.?\s*(\d+)/i);
  const page = pageMatch ? `s. ${pageMatch[1]}` : ref.chapterOrPage;

  return `${shortTitle} ${page}`;
}

export function WorkoutPhaseCard({ date, session, onOpenDetail }: WorkoutPhaseCardProps) {
  const toggleLockWorkout = useTrainingStore((s) => s.toggleLockWorkout);
  const openDetailModal = useTrainingStore((s) => s.openDetailModal);
  const today = getTodayDate();
  const isFuture = date > today;
  const matchStatus = computeSessionMatchStatus(session, date, today);
  const plannedText = formatPlanned(session);
  const actualText = formatActual(session);
  const bookLabel = bookBadgeLabel(session);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (onOpenDetail) {
          onOpenDetail(session.id);
        } else {
          openDetailModal(date, session.id);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (onOpenDetail) {
            onOpenDetail(session.id);
          } else {
            openDetailModal(date, session.id);
          }
        }
      }}
      className={`cursor-pointer rounded-md border px-2 py-1.5 text-[10px] leading-tight ${activityCardClassName(session.type)}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="rounded bg-white/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide">
              {session.phase}
            </span>
            {matchStatus && (
              <span title={matchStatus === 'match' ? 'Splněno' : matchStatus === 'partial' ? 'Odchylka' : 'Nedokončeno'}>
                {getMatchEmoji(matchStatus)}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-semibold">{session.title}</p>
        </div>

        {isFuture && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleLockWorkout(date, session.id);
            }}
            className="shrink-0 rounded p-0.5 text-xs hover:bg-white/50"
            title={session.isLocked ? 'Odemknout fázi' : 'Zamknout fázi'}
            aria-label={session.isLocked ? 'Odemknout fázi' : 'Zamknout fázi'}
          >
            {session.isLocked ? '🔒' : '🔓'}
          </button>
        )}
      </div>

      <div className="mt-1 space-y-0.5 opacity-90">
        <p className="truncate">
          <span className="font-medium">Plán:</span> {plannedText}
        </p>
        {actualText && (
          <p className="truncate">
            <span className="font-medium">Real:</span> {actualText}
            {session.actual?.garminSyncStatus === 'pending' && (
              <span className="ml-1 text-amber-600">⏳</span>
            )}
          </p>
        )}
      </div>

      {bookLabel && (
        <span className="mt-1 inline-flex items-center gap-0.5 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-medium">
          📖 {bookLabel}
        </span>
      )}

      {matchStatus && (
        <span
          className={`mt-1 inline-block h-1.5 w-1.5 rounded-full ${getMatchIndicatorColors(matchStatus).dot}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
