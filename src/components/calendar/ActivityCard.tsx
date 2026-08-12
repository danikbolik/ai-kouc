'use client';

import { activityCardClassName } from '../../lib/colors';
import { useTrainingStore } from '../../store/useTrainingStore';
import type { Activity } from '../../types/training';

interface ActivityCardProps {
  date: string;
  activity: Activity;
  onOpenDetail?: () => void;
}

export function ActivityCard({ date, activity, onOpenDetail }: ActivityCardProps) {
  const openDetailModal = useTrainingStore((s) => s.openDetailModal);

  const duration =
    activity.durationMin && activity.durationMin > 0
      ? activity.durationMin >= 60
        ? `${Math.floor(activity.durationMin / 60)}h ${activity.durationMin % 60}m`
        : `${activity.durationMin} min`
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (onOpenDetail) onOpenDetail();
        else openDetailModal(date, activity.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (onOpenDetail) onOpenDetail();
          else openDetailModal(date, activity.id);
        }
      }}
      className={`cursor-pointer rounded-md border px-2 py-1.5 text-[10px] leading-tight ring-1 ring-orange-200/80 ${activityCardClassName(activity.type)}`}
    >
      <div className="flex items-center gap-1">
        <span className="rounded bg-white/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide">
          {activity.phase ?? 'RUN'}
        </span>
        <span className="text-[9px] font-medium text-orange-700">Strava</span>
      </div>
      <p className="mt-0.5 truncate font-semibold">{activity.title}</p>
      <p className="mt-1 truncate opacity-90">
        {activity.distanceKm} km @{activity.avgPace}
        {duration ? ` · ${duration}` : ''}
      </p>
    </div>
  );
}
