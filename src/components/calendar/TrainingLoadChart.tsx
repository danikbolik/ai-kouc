'use client';

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { computeLoadMetrics, computeLoadMetricsTimeSeries } from '@/lib/loadManagement';
import type { DayData } from '@/types/training';
import type { UserMetrics } from '@/types/settings';

interface TrainingLoadChartProps {
  days: Record<string, DayData>;
  userMetrics: UserMetrics;
  lookbackDays?: number;
}

function formatChartDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${day}.${month}.`;
}

function tsbStatusLabel(tsb: number): string {
  if (tsb < -20) return 'Riziko přetrénování';
  if (tsb < -10) return 'Únava';
  if (tsb > 10) return 'Ideální vyladění';
  return 'Vyvážená zátěž';
}

export function TrainingLoadChart({
  days,
  userMetrics,
  lookbackDays = 60,
}: TrainingLoadChartProps) {
  const series = useMemo(
    () => computeLoadMetricsTimeSeries(days, userMetrics, lookbackDays),
    [days, userMetrics, lookbackDays],
  );

  const snapshot = useMemo(
    () => computeLoadMetrics(days, userMetrics, lookbackDays),
    [days, userMetrics, lookbackDays],
  );

  if (series.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-5">
        <h3 className="text-sm font-semibold text-slate-900">Kondice, únava a forma (CTL / ATL / TSB)</h3>
        <p className="mt-2 text-xs text-slate-500">
          Pro zobrazení grafu synchronizuj běhy ze Stravy nebo přidej tréninky s TSS.
        </p>
      </section>
    );
  }

  const chartData = series.map((point) => ({
    ...point,
    label: formatChartDate(point.date),
  }));

  const status = tsbStatusLabel(snapshot.tsb);

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Kondice, únava a forma (CTL / ATL / TSB)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">Posledních {lookbackDays} dní</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">
            CTL {snapshot.ctl}
          </span>
          <span className="rounded-full bg-orange-50 px-2.5 py-1 font-semibold text-orange-800">
            ATL {snapshot.atl}
          </span>
          <span
            className={[
              'rounded-full px-2.5 py-1 font-semibold',
              snapshot.tsb < -20
                ? 'bg-red-50 text-red-800'
                : snapshot.tsb > 10
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-slate-100 text-slate-700',
            ].join(' ')}
          >
            TSB {snapshot.tsb > 0 ? '+' : ''}
            {snapshot.tsb} · {status}
          </span>
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#64748b' }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={36} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
              }}
              formatter={(value, name) => {
                const numeric = typeof value === 'number' ? value : Number(value ?? 0);
                const key = String(name);
                const label =
                  key === 'ctl' ? 'CTL (kondice)' : key === 'atl' ? 'ATL (únava)' : 'TSB (forma)';
                return [numeric, label];
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as { date?: string } | undefined;
                return row?.date ?? '';
              }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              formatter={(value) =>
                value === 'ctl'
                  ? 'CTL – kondice (42d)'
                  : value === 'atl'
                    ? 'ATL – únava (7d)'
                    : 'TSB – forma'
              }
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
            <ReferenceLine y={-20} stroke="#fca5a5" strokeDasharray="2 6" label={{ value: 'TSB -20', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
            <Line type="monotone" dataKey="ctl" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="atl" stroke="#ea580c" strokeWidth={2} dot={false} />
            <Area
              type="monotone"
              dataKey="tsb"
              stroke="#059669"
              fill="#d1fae5"
              fillOpacity={0.45}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        TSB &gt; +10 = fresh forma · TSB mezi -10 a +10 = vyvážená zátěž · TSB &lt; -20 = riziko
        přetrénování
      </p>
    </section>
  );
}
