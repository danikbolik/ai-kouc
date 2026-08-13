'use client';

import { useEffect, useState } from 'react';

import { createEmptyPlannedWorkout } from '../../lib/calendarActions';
import { getPlannedWorkouts, normalizeDayData } from '../../lib/dayData';
import { getWeekdayShort } from '../../lib/dates';
import {
  buildIntervalDescription,
  buildIntervalTitle,
  createDefaultInterval,
  estimateIntervalDistanceKm,
} from '../../lib/intervalBuilder';
import { needsWarmUpCoolDown, RACE_TYPE_OPTIONS } from '../../lib/workoutExtras';
import { useTrainingStore } from '../../store/useTrainingStore';
import type {
  ActivityType,
  PlannedWorkout,
  RaceDetails,
  WarmCoolSegment,
  WorkoutInterval,
} from '../../types/training';
import { IntervalBuilder } from './IntervalBuilder';

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'klus', label: 'Klus' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'intervals', label: 'Intervalový trénink' },
  { value: 'longrun', label: 'Dlouhý běh' },
  { value: 'strength', label: 'Síla' },
  { value: 'mobility', label: 'Mobilita' },
  { value: 'rest', label: 'Odpočinek' },
  { value: 'race', label: 'Závod' },
];

const PHASES: PlannedWorkout['phase'][] = ['AM', 'PM', 'EVENING'];

function defaultWarmCool(): WarmCoolSegment {
  return { value: 2, unit: 'km' };
}

function defaultRaceDetails(): RaceDetails {
  return { durationMin: 60, distanceValue: 10, distanceUnit: 'km', raceType: 'track_road' };
}

function WarmCoolField({
  label,
  segment,
  onChange,
}: {
  label: string;
  segment: WarmCoolSegment;
  onChange: (next: WarmCoolSegment) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <span className="mb-2 block text-xs font-semibold uppercase text-slate-500">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min="0"
          step="0.1"
          value={segment.value || ''}
          onChange={(e) =>
            onChange({ ...segment, value: e.target.value ? Number(e.target.value) : 0 })
          }
          placeholder="Hodnota"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={segment.unit}
          onChange={(e) => onChange({ ...segment, unit: e.target.value as WarmCoolSegment['unit'] })}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="km">km</option>
          <option value="min">min</option>
        </select>
      </div>
    </div>
  );
}

export function WorkoutEditModal() {
  const isOpen = useTrainingStore((s) => s.isEditModalOpen);
  const selectedDate = useTrainingStore((s) => s.selectedDate);
  const editSessionId = useTrainingStore((s) => s.editSessionId);
  const days = useTrainingStore((s) => s.days);
  const closeEditModal = useTrainingStore((s) => s.closeEditModal);
  const upsertPlannedWorkout = useTrainingStore((s) => s.upsertPlannedWorkout);
  const deleteSession = useTrainingStore((s) => s.deleteSession);

  const [form, setForm] = useState<PlannedWorkout>(() => createEmptyPlannedWorkout(selectedDate));
  const [interval, setInterval] = useState<WorkoutInterval>(() => createDefaultInterval());

  useEffect(() => {
    if (!isOpen) return;
    const day = days[selectedDate] ? normalizeDayData(days[selectedDate]) : undefined;
    const workout = editSessionId
      ? getPlannedWorkouts(day).find((w) => w.id === editSessionId)
      : undefined;
    const nextForm = workout ?? createEmptyPlannedWorkout(selectedDate);
    setForm({
      ...nextForm,
      warmUp: nextForm.warmUp ?? (needsWarmUpCoolDown(nextForm.type) ? defaultWarmCool() : undefined),
      coolDown:
        nextForm.coolDown ?? (needsWarmUpCoolDown(nextForm.type) ? defaultWarmCool() : undefined),
      raceDetails:
        nextForm.type === 'race' ? (nextForm.raceDetails ?? defaultRaceDetails()) : nextForm.raceDetails,
    });
    setInterval(nextForm.intervals?.[0] ?? createDefaultInterval());
  }, [isOpen, selectedDate, editSessionId, days]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditModal();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeEditModal]);

  const isEditing = Boolean(editSessionId);
  const isIntervalWorkout = form.type === 'intervals';
  const showWarmCool = needsWarmUpCoolDown(form.type);
  const showRaceFields = form.type === 'race';

  const applyIntervalToForm = (nextInterval: WorkoutInterval) => {
    setForm({
      ...form,
      type: 'intervals',
      intervals: [nextInterval],
      title: buildIntervalTitle(nextInterval),
      description: buildIntervalDescription(nextInterval),
      targetPace: nextInterval.targetPace,
      distanceKm: estimateIntervalDistanceKm(nextInterval),
    });
  };

  const handleTypeChange = (type: ActivityType) => {
    const warmCoolDefaults = needsWarmUpCoolDown(type)
      ? { warmUp: form.warmUp ?? defaultWarmCool(), coolDown: form.coolDown ?? defaultWarmCool() }
      : { warmUp: undefined, coolDown: undefined };

    if (type === 'intervals') {
      const nextInterval = form.intervals?.[0] ?? interval;
      setInterval(nextInterval);
      applyIntervalToForm(nextInterval);
      setForm((prev) => ({ ...prev, ...warmCoolDefaults }));
      return;
    }

    setForm({
      ...form,
      type,
      intervals: undefined,
      ...warmCoolDefaults,
      raceDetails: type === 'race' ? (form.raceDetails ?? defaultRaceDetails()) : undefined,
    });
  };

  const handleSave = () => {
    const payload =
      form.type === 'intervals'
        ? {
            ...form,
            intervals: [interval],
            title: form.title || buildIntervalTitle(interval),
            description: form.description || buildIntervalDescription(interval),
            distanceKm: form.distanceKm ?? estimateIntervalDistanceKm(interval),
          }
        : form;
    upsertPlannedWorkout(selectedDate, payload);
    closeEditModal();
  };

  const handleDelete = () => {
    if (editSessionId) {
      deleteSession(selectedDate, editSessionId);
    }
    closeEditModal();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Zavřít editor"
        onClick={closeEditModal}
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditing ? 'Upravit trénink' : 'Přidat trénink'}
          </h2>
          <p className="text-sm text-slate-500">
            {getWeekdayShort(selectedDate)} {selectedDate}
          </p>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Název</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Typ</span>
              <select
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value as ActivityType)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Fáze</span>
              <select
                value={form.phase}
                onChange={(e) =>
                  setForm({ ...form, phase: e.target.value as PlannedWorkout['phase'] })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {showRaceFields && (
            <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-800">
                Specifikace závodu
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Trvání (min)
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={form.raceDetails?.durationMin ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        raceDetails: {
                          ...form.raceDetails,
                          durationMin: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Typ závodu</span>
                  <select
                    value={form.raceDetails?.raceType ?? 'track_road'}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        raceDetails: {
                          ...form.raceDetails,
                          raceType: e.target.value as RaceDetails['raceType'],
                        },
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {RACE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Vzdálenost</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.raceDetails?.distanceValue ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        raceDetails: {
                          ...form.raceDetails,
                          distanceValue: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Jednotka</span>
                  <select
                    value={form.raceDetails?.distanceUnit ?? 'km'}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        raceDetails: {
                          ...form.raceDetails,
                          distanceUnit: e.target.value as 'km' | 'm',
                        },
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="km">km</option>
                    <option value="m">m</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {isIntervalWorkout ? (
            <IntervalBuilder
              interval={interval}
              onChange={(next) => {
                setInterval(next);
                applyIntervalToForm(next);
              }}
              onApplyToWorkout={applyIntervalToForm}
            />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Km</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.distanceKm ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      distanceKm: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Tempo</span>
                <input
                  type="text"
                  placeholder="5:30"
                  value={form.targetPace ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, targetPace: e.target.value || undefined })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">TF</span>
                <input
                  type="number"
                  min="0"
                  value={form.targetHR ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targetHR: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {showWarmCool && (
            <div className="grid grid-cols-2 gap-3">
              <WarmCoolField
                label="Rozklus"
                segment={form.warmUp ?? defaultWarmCool()}
                onChange={(warmUp) => setForm({ ...form, warmUp })}
              />
              <WarmCoolField
                label="Výklus"
                segment={form.coolDown ?? defaultWarmCool()}
                onChange={(coolDown) => setForm({ ...form, coolDown })}
              />
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Popis</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isLocked}
              onChange={(e) => setForm({ ...form, isLocked: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Zamknout proti AI přepočtu</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          {isEditing ? (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Smazat
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeEditModal}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Uložit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
