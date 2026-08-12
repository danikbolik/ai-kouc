'use client';

import type { WorkoutInterval } from '../../types/training';

const ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

interface IntervalBuilderProps {
  interval: WorkoutInterval;
  onChange: (interval: WorkoutInterval) => void;
  onApplyToWorkout: (interval: WorkoutInterval) => void;
}

export function IntervalBuilder({ interval, onChange, onApplyToWorkout }: IntervalBuilderProps) {
  const useZone = Boolean(interval.targetZone && !interval.targetPace);

  return (
    <div className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-800">
          Intervalový builder
        </h3>
        <button
          type="button"
          onClick={() => onApplyToWorkout(interval)}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
        >
          Vygenerovat název
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Počet opakování</span>
          <input
            type="number"
            min={1}
            value={interval.repetitions}
            onChange={(e) =>
              onChange({ ...interval, repetitions: Math.max(1, Number(e.target.value) || 1) })
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Délka úseku</span>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={interval.segmentValue}
              onChange={(e) =>
                onChange({ ...interval, segmentValue: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={interval.segmentUnit}
              onChange={(e) =>
                onChange({
                  ...interval,
                  segmentUnit: e.target.value as WorkoutInterval['segmentUnit'],
                })
              }
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              <option value="m">m</option>
              <option value="km">km</option>
              <option value="min">min</option>
            </select>
          </div>
        </label>
      </div>

      <div className="space-y-2">
        <span className="block text-xs font-medium text-slate-600">Cílové tempo nebo zóna</span>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              checked={!useZone}
              onChange={() =>
                onChange({
                  ...interval,
                  targetZone: undefined,
                  targetPace: interval.targetPace ?? '4:00',
                })
              }
            />
            Tempo
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              checked={useZone}
              onChange={() =>
                onChange({
                  ...interval,
                  targetPace: undefined,
                  targetZone: interval.targetZone ?? 'Z4',
                })
              }
            />
            Zóna
          </label>
        </div>

        {!useZone ? (
          <input
            type="text"
            placeholder="3:45"
            value={interval.targetPace ?? ''}
            onChange={(e) =>
              onChange({ ...interval, targetPace: e.target.value || undefined, targetZone: undefined })
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        ) : (
          <select
            value={interval.targetZone ?? 'Z4'}
            onChange={(e) =>
              onChange({
                ...interval,
                targetZone: e.target.value as WorkoutInterval['targetZone'],
                targetPace: undefined,
              })
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Pauza / meziklus</span>
          <input
            type="number"
            min={0}
            value={interval.recoveryValue ?? ''}
            onChange={(e) =>
              onChange({
                ...interval,
                recoveryValue: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Jednotka pauzy</span>
          <select
            value={interval.recoveryUnit ?? 'min'}
            onChange={(e) =>
              onChange({
                ...interval,
                recoveryUnit: e.target.value as WorkoutInterval['recoveryUnit'],
              })
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="min">min</option>
            <option value="m">m</option>
            <option value="km">km</option>
          </select>
        </label>
      </div>
    </div>
  );
}
