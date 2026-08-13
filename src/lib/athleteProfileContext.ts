import { getDaysUntilDate, getTodayDate, getTrainingPhaseLabel, parseDate } from './dates';
import type { UserMetrics } from '../types/settings';
import { formatPaceZoneForDisplay } from '../types/settings';

/** Odvozené tepové zóny Z1–Z5 z profilu sportovce */
export function buildHrZonesContext(userMetrics: UserMetrics): string {
  const max = userMetrics.HRmax;
  const aet = userMetrics.AeT ?? Math.round(max * 0.75);
  const anp = userMetrics.ANP;
  const z1Max = Math.round(max * 0.65);
  const z4Max = Math.round(max * 0.95);

  return [
    'Tepové zóny (VYHODNOCUJ KAŽDÝ BĚH STRIKTNĚ PODLE TĚCHTO HRANIC – ne obecných tabulek):',
    `  Z1 regenerace/easy: TF ≤ ${z1Max} bpm`,
    `  Z2 aerobní objem: ${z1Max + 1}–${aet} bpm`,
    `  Z3 střední/intenzita: ${aet + 1}–${anp} bpm`,
    `  Z4 prahová/závodní: ${anp + 1}–${z4Max} bpm`,
    `  Z5 VO2max/sprint: > ${z4Max} bpm`,
    `  Referenční prahy: AeT ${aet} bpm | ANP/LT ${anp} bpm | TFmax ${max} bpm`,
  ].join('\n');
}

export function classifyHeartRateZone(hr: number, userMetrics: UserMetrics): string {
  if (hr <= 0) return 'neznámá';
  const max = userMetrics.HRmax;
  const aet = userMetrics.AeT ?? Math.round(max * 0.75);
  const anp = userMetrics.ANP;
  const z1Max = Math.round(max * 0.65);
  const z4Max = Math.round(max * 0.95);

  if (hr <= z1Max) return 'Z1';
  if (hr <= aet) return 'Z2';
  if (hr <= anp) return 'Z3';
  if (hr <= z4Max) return 'Z4';
  return 'Z5';
}

export function buildEnhancedAthleteProfile(userMetrics: UserMetrics): string {
  const today = getTodayDate();
  const paceZoneLines =
    userMetrics.paceZones?.map(
      (zone) => `  ${zone.zone}: ${formatPaceZoneForDisplay(zone)} min/km`,
    ) ?? [];

  const daysToRace =
    userMetrics.raceDate && userMetrics.raceDate >= today
      ? getDaysUntilDate(today, userMetrics.raceDate)
      : null;

  return [
    `HRmax: ${userMetrics.HRmax} bpm`,
    userMetrics.AeT !== undefined ? `Aerobní práh (AeT): ${userMetrics.AeT} bpm` : null,
    `Anaerobní práh (ANP/LT): ${userMetrics.ANP} bpm`,
    buildHrZonesContext(userMetrics),
    paceZoneLines.length > 0
      ? `Tempové zóny (min/km):\n${paceZoneLines.join('\n')}`
      : null,
    '',
    '## Cíle a periodizace',
    `Cílový závod: ${userMetrics.targetRace}`,
    userMetrics.raceDate ? `Datum závodu: ${userMetrics.raceDate}` : null,
    daysToRace !== null ? `Do závodu: ${daysToRace} dní` : null,
    userMetrics.raceDistanceKm !== undefined
      ? `Vzdálenost závodu: ${userMetrics.raceDistanceKm} km`
      : null,
    `Aktuální tréninková fáze/blok: ${getTrainingPhaseLabel(today)}`,
  ]
    .filter((line) => line !== null && line !== '')
    .join('\n');
}

const MACRO_PHASE_GUIDANCE: Record<string, { macro: string; focus: string; warn: string }> = {
  'Zimní báze': {
    macro: 'Všeobecná příprava / Zima – Budování základu',
    focus: 'Vysoký podíl Z1–Z2 (80 %+), longruny, kopce/síla, technika. Prahové objemy nízko.',
    warn: 'Kritizuj přemíru VO2max intervalů a závodní intenzity mimo testy.',
  },
  'Přípravný blok': {
    macro: 'Pozdní general / přechod k specifické přípravě',
    focus: 'Postupné zavádění tempa a delších prahových úseků, udržet aerobní objem.',
    warn: 'Varuj před skokem intenzity bez dostatečné Z2 báze.',
  },
  'Objemový blok': {
    macro: 'Specifická příprava – Objemová fáze',
    focus: 'Vysoký km objem v Z2, 1 kvalitní prahový trénink/týden, longrun progres.',
    warn: 'Kritizuj 3+ hard days za sebou nebo longrun + intervaly back-to-back.',
  },
  'Prahový blok': {
    macro: 'Specifická příprava – Prahová/intenzivní fáze',
    focus: 'Prahové běhy, race-specific tempo, udržet 75–80 % objemu v Z1–Z2.',
    warn: 'Varuj pokud polarizace klesne pod 70 % easy.',
  },
  'Závodní taper': {
    macro: 'Tapering / Vyladění',
    focus: 'Snížení objemu 40–60 %, krátká ostření, maximum regenerace.',
    warn: 'Kritizuj jakýkoli objemový nebo intervalový skok v taperu.',
  },
  Regenerace: {
    macro: 'Regenerační / přechodné období',
    focus: 'Lehký objem Z1–Z2, bez strukturované intenzity.',
    warn: 'Varuj před předčasným návratem k hard tréninku.',
  },
};

export function buildMacrocyclePhaseContext(userMetrics: UserMetrics): string {
  const today = getTodayDate();
  const phaseLabel = getTrainingPhaseLabel(today);
  const guidance = MACRO_PHASE_GUIDANCE[phaseLabel] ?? {
    macro: phaseLabel,
    focus: 'Vyhodnoť trénink v kontextu aktuální fáze periodizace.',
    warn: 'Kontroluj skoky intenzity a objemu.',
  };

  const month = parseDate(today).getMonth();
  const seasonNote =
    month >= 10 || month <= 2
      ? 'Aktuálně zimní období – prioritou je aerobní báze, síla a kopce, ne závodní forma.'
      : month >= 5 && month <= 8
        ? 'Letní sezóna – vyšší podíl specifické intenzity a závodů je očekávaný.'
        : 'Mimo zimní sezónu – postupný přechod mezi objemem a specifickou intenzitou.';

  const daysToRace =
    userMetrics.raceDate && userMetrics.raceDate >= today
      ? getDaysUntilDate(today, userMetrics.raceDate)
      : null;

  return `## Makrocyklus a fáze přípravy

- **Aktuální blok:** ${phaseLabel}
- **Makro-fáze:** ${guidance.macro}
- **Sezónní kontext:** ${seasonNote}
${daysToRace !== null ? `- **Do cílového závodu (${userMetrics.targetRace}):** ${daysToRace} dní` : ''}

### Co v této fázi vyžadovat
${guidance.focus}

### Co v této fázi kritizovat
${guidance.warn}

PŘÍKAZ: Hodnoť každý trénink a plán POUZE v kontextu této fáze – ne aplikuj pravidla taperu v zimní bázi ani objemové longruny v taperu.`;
}
