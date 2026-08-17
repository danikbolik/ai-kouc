'use client';

import {
  comparePlannedSegmentsToLaps,
  buildPlannedSegments,
  getSegmentStatusClasses,
  type SegmentComparisonRow,
} from '@/lib/workoutSegmentBreakdown';
import type { PlannedWorkout, StravaLapSummary } from '@/types/training';

interface WorkoutSegmentBreakdownTableProps {
  workout: PlannedWorkout;
  laps?: StravaLapSummary[];
}

function SegmentRow({ row }: { row: SegmentComparisonRow }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2.5 font-medium text-slate-800">{row.label}</td>
      <td className="px-3 py-2.5 text-slate-700">{row.plannedText}</td>
      <td className="px-3 py-2.5 text-slate-900">{row.actualText}</td>
      <td className="px-3 py-2.5">
        <span
          className={[
            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
            getSegmentStatusClasses(row.status),
          ].join(' ')}
        >
          {row.statusLabel}
        </span>
      </td>
    </tr>
  );
}

export function WorkoutSegmentBreakdownTable({ workout, laps }: WorkoutSegmentBreakdownTableProps) {
  const planned = buildPlannedSegments(workout);
  const rows = comparePlannedSegmentsToLaps(planned, laps);

  if (planned.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white/70">
      <div className="border-b border-slate-200 px-3 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Plán vs. realita (úseky / lapy)
        </h4>
      </div>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Část</th>
            <th className="px-3 py-2 font-semibold">Plán</th>
            <th className="px-3 py-2 font-semibold">Realita (Strava)</th>
            <th className="px-3 py-2 font-semibold">Stav</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SegmentRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
      {!laps?.length && (
        <p className="px-3 py-2 text-xs text-slate-500">
          Pro porovnání synchronizuj aktivitu ze Stravy (lapy / mezičasy).
        </p>
      )}
    </div>
  );
}
