'use client';

import { useState } from 'react';

import { formatDurationFromSeconds } from '@/lib/strava';
import type { StravaHrZoneSummary, StravaLapSummary } from '@/types/training';

const ZONE_COLORS: Record<StravaHrZoneSummary['zone'], string> = {
  Z1: 'bg-sky-400',
  Z2: 'bg-emerald-500',
  Z3: 'bg-yellow-400',
  Z4: 'bg-orange-500',
  Z5: 'bg-red-500',
};

export function StravaLapsTable({ laps }: { laps: StravaLapSummary[] }) {
  if (laps.length === 0) {
    return (
      <p className="rounded-lg bg-white/60 px-3 py-4 text-sm text-slate-500">
        Strava pro tuto aktivitu nevrátila mezičasy.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-white/60">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Úsek</th>
            <th className="px-3 py-2 font-semibold">Vzdálenost</th>
            <th className="px-3 py-2 font-semibold">Tempo</th>
            <th className="px-3 py-2 font-semibold">Průměrný tep</th>
            <th className="px-3 py-2 font-semibold">Čas</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => (
            <tr key={lap.index} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 font-medium text-slate-800">{lap.label}</td>
              <td className="px-3 py-2 text-slate-700">{lap.distanceKm} km</td>
              <td className="px-3 py-2 font-semibold text-slate-900">{lap.pace}/km</td>
              <td className="px-3 py-2 text-slate-700">{lap.avgHR > 0 ? `${lap.avgHR} bpm` : '—'}</td>
              <td className="px-3 py-2 text-slate-700">
                {formatDurationFromSeconds(lap.durationSec)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StravaHrZonesChart({ zones }: { zones: StravaHrZoneSummary[] }) {
  const activeZones = zones.filter((zone) => zone.timeSec > 0);

  if (activeZones.length === 0) {
    return (
      <p className="rounded-lg bg-white/60 px-3 py-4 text-sm text-slate-500">
        Strava pro tuto aktivitu nevrátila tepové zóny (chybí HR data nebo nejsou nastavené zóny).
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg bg-white/60 p-3">
      <div className="flex h-8 overflow-hidden rounded-lg border border-slate-200">
        {activeZones.map((zone) => (
          <div
            key={zone.zone}
            className={`${ZONE_COLORS[zone.zone]} transition-all`}
            style={{ width: `${zone.percent}%` }}
            title={`${zone.zone}: ${zone.percent}%`}
          />
        ))}
      </div>

      <div className="space-y-2">
        {activeZones.map((zone) => (
          <div key={zone.zone} className="flex items-center gap-3 text-sm">
            <span
              className={`inline-flex h-6 w-10 items-center justify-center rounded-md text-xs font-bold text-white ${ZONE_COLORS[zone.zone]}`}
            >
              {zone.zone}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">
                  {zone.minHR}–{zone.maxHR} bpm
                </span>
                <span className="font-semibold text-slate-900">{zone.percent}%</span>
              </div>
              <p className="text-xs text-slate-500">
                {formatDurationFromSeconds(zone.timeSec)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type StravaDetailTab = 'overview' | 'laps' | 'zones';

export function StravaActivityDetailTabs({
  laps,
  hrZones,
  overview,
}: {
  laps?: StravaLapSummary[];
  hrZones?: StravaHrZoneSummary[];
  overview: React.ReactNode;
}) {
  const hasLaps = Boolean(laps?.length);
  const hasZones = Boolean(hrZones?.length);
  const tabs: { id: StravaDetailTab; label: string; enabled: boolean }[] = [
    { id: 'overview', label: 'Přehled', enabled: true },
    { id: 'laps', label: 'Mezičasy / Lapy', enabled: hasLaps },
    { id: 'zones', label: 'Tepové zóny', enabled: hasZones },
  ];

  const [activeTab, setActiveTab] = useState<StravaDetailTab>('overview');

  const visibleTabs = tabs.filter((tab) => tab.enabled || tab.id === 'overview');

  return (
    <div className="space-y-3">
      {visibleTabs.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-white text-slate-900 ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/70',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'overview' && overview}
      {activeTab === 'laps' && <StravaLapsTable laps={laps ?? []} />}
      {activeTab === 'zones' && <StravaHrZonesChart zones={hrZones ?? []} />}
    </div>
  );
}
