import { getTodayDate, getWeekDays, parseDate } from './dates';
import type { UserMetrics } from '../types/settings';

export type MesocycleWeek = 1 | 2 | 3 | 4;

export function getMesocycleWeek(
  mesocycleStartDate: string | undefined,
  today = getTodayDate(),
): MesocycleWeek {
  if (!mesocycleStartDate) return 1;

  const startMonday = getWeekDays(parseDate(mesocycleStartDate))[0];
  const todayMonday = getWeekDays(parseDate(today))[0];
  const startMs = parseDate(startMonday).getTime();
  const todayMs = parseDate(todayMonday).getTime();
  const weeksElapsed = Math.floor((todayMs - startMs) / (7 * 24 * 60 * 60 * 1000));

  if (weeksElapsed < 0) return 1;

  const weekInCycle = (weeksElapsed % 4) + 1;
  return weekInCycle as MesocycleWeek;
}

export function getMesocyclePhaseLabel(week: MesocycleWeek): string {
  if (week === 4) return 'Deload (týden 4 – snížení objemu o 30–40 %)';
  return `Budování / nárůst (týden ${week} ze 3+1 cyklu)`;
}

export function isMesocycleDeloadWeek(week: MesocycleWeek): boolean {
  return week === 4;
}

export function buildMesocycleContext(userMetrics: UserMetrics): string {
  const today = getTodayDate();
  const week = getMesocycleWeek(userMetrics.mesocycleStartDate, today);
  const phase = getMesocyclePhaseLabel(week);
  const startLine = userMetrics.mesocycleStartDate
    ? `Start mesocyklu: ${userMetrics.mesocycleStartDate} (pondělí cyklu)`
    : 'Start mesocyklu není nastaven – předpokládej týden 1';

  const deloadRule =
    week === 4
      ? '⚠ AKTUÁLNĚ DELOAD TÝDEN – striktně odmítni navýšení zátěže, sniž objem o 30–40 %, prioritizuj regeneraci'
      : 'Týdny 1–3: progresivní budování – kontroluj skoky TSS/CTL';

  return `## Mesocyklus 3+1 (periodizace)

- ${startLine}
- **Aktuální týden v cyklu:** ${week} / 4
- **Fáze:** ${phase}
- ${deloadRule}

PŘÍKAZ PRO AI: Respektuj pravidlo 3+1. V týdnu 4 (deload) NIKDY nenavrhuj vyšší objem/intenzitu než v týdnu 3.`;
}
