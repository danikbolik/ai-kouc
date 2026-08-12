'use client';

import { getActivities, getPlannedWorkouts, normalizeDayData } from '../../lib/dayData';
import { getTodayDate, getDayNumber, getWeekdayShort, isSameMonth } from '../../lib/dates';
import { useTrainingStore } from '../../store/useTrainingStore';
import type { DayData, PlannedWorkout, WorkoutSession } from '../../types/training';
import { ActivityCard } from './ActivityCard';
import { WorkoutPhaseCard } from './WorkoutPhaseCard';

interface DayCardProps {
  date: string;
  dayData?: DayData;
  viewDate: Date;
  isCompact?: boolean;
}

function plannedToSession(workout: PlannedWorkout, activities: ReturnType<typeof getActivities>): WorkoutSession {
  const matched = activities.find((a) => a.phase === workout.phase);
  return {
    id: workout.id,
    phase: workout.phase,
    title: workout.title,
    type: workout.type,
    isLocked: workout.isLocked,
    planned: {
      description: workout.description,
      distanceKm: workout.distanceKm,
      targetPace: workout.targetPace,
      targetHR: workout.targetHR,
      bookReference: workout.bookReference,
    },
    actual: matched
      ? {
          distanceKm: matched.distanceKm,
          durationMin: matched.durationMin,
          avgPace: matched.avgPace,
          avgHR: matched.avgHR,
          garminSyncStatus: matched.garminSyncStatus,
          stravaActivityId: matched.stravaActivityId,
          laps: matched.laps,
          hrZones: matched.hrZones,
        }
      : undefined,
  };
}

export function DayCard({ date, dayData, viewDate, isCompact = false }: DayCardProps) {
  const selectedDate = useTrainingStore((s) => s.selectedDate);
  const openDetailModal = useTrainingStore((s) => s.openDetailModal);
  const openEditModal = useTrainingStore((s) => s.openEditModal);

  const today = getTodayDate();
  const isToday = date === today;
  const isSelected = date === selectedDate;
  const inCurrentMonth = isSameMonth(date, viewDate);

  const normalized = dayData ? normalizeDayData(dayData) : undefined;
  const plannedWorkouts = normalized ? getPlannedWorkouts(normalized) : [];
  const activities = normalized ? getActivities(normalized) : [];
  const feedback = normalized?.feedback;
  const hasContent = plannedWorkouts.length > 0 || activities.length > 0;

  const linkedActivityIds = new Set(
    plannedWorkouts
      .map((w) => activities.find((a) => a.phase === w.phase)?.id)
      .filter(Boolean),
  );
  const standaloneActivities = activities.filter((a) => !linkedActivityIds.has(a.id));

  return (
    <button
      type="button"
      onClick={() => openDetailModal(date)}
      className={[
        'flex min-h-[120px] flex-col rounded-xl border text-left transition-all',
        isCompact ? 'min-h-[100px]' : 'min-h-[140px]',
        isSelected
          ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-300'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
        !inCurrentMonth && 'opacity-40',
        isToday && !isSelected && 'border-emerald-300 bg-emerald-50/30',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={[
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
              isToday ? 'bg-emerald-600 text-white' : 'text-slate-700',
            ].join(' ')}
          >
            {getDayNumber(date)}
          </span>
          <span className="text-[10px] font-medium uppercase text-slate-500">
            {getWeekdayShort(date)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isToday && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              Dnes
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEditModal(date);
            }}
            className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Přidat trénink"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-hidden p-1.5">
        {!hasContent ? (
          <p className="flex flex-1 items-center justify-center text-[10px] text-slate-300">—</p>
        ) : (
          <>
            {plannedWorkouts.map((workout) => (
              <WorkoutPhaseCard
                key={workout.id}
                date={date}
                session={plannedToSession(workout, activities)}
                onOpenDetail={(sessionId) => openDetailModal(date, sessionId)}
              />
            ))}
            {standaloneActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                date={date}
                activity={activity}
                onOpenDetail={() => openDetailModal(date, activity.id)}
              />
            ))}
          </>
        )}
      </div>

      {(feedback?.readinessScore !== undefined || feedback?.rpe !== undefined) && (
        <div className="flex flex-wrap gap-1 border-t border-slate-100 px-2 py-1">
          {feedback.readinessScore !== undefined && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
              Únava: {feedback.readinessScore}/10
            </span>
          )}
          {feedback.rpe !== undefined && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
              RPE: {feedback.rpe}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
