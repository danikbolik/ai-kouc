import { getDaysUntilDate, getTodayDate, getTrainingPhaseLabel, parseDate } from './dates';
import type { UserMetrics } from '../types/settings';
import {
  classifyBpmToHrZone,
  formatBpmWithHrZone,
  formatHrZoneForDisplay,
  formatPaceZoneForDisplay,
  getEffectiveHrZones,
} from '../types/settings';

/** Tepové zóny z profilu sportovce – striktní BPM rozsahy pro AI */
export function buildHrZonesContext(userMetrics: UserMetrics): string {
  const zones = getEffectiveHrZones(userMetrics);
  const zoneLines = zones.map(
    (zone) =>
      `  ${zone.zone} (${zone.description}): TF ${formatHrZoneForDisplay(zone)} bpm`,
  );

  const z12 = zones.filter((z) => z.zone === 'Z1' || z.zone === 'Z2');
  const z12Range = z12
    .flatMap((z) => [z.minBpm, z.maxBpm])
    .filter((v): v is number => v !== undefined);
  const z12Min = z12Range.length > 0 ? Math.min(...z12Range) : '?';
  const z12Max = z12Range.length > 0 ? Math.max(...z12Range) : '?';

  const example165 = formatBpmWithHrZone(165, userMetrics);
  const example142 = formatBpmWithHrZone(142, userMetrics);

  return [
    'Tepové zóny (BPM) – STRIKTNÍ PRAVIDLA, NIKDY nezaměňuj zóny:',
    ...zoneLines,
    '',
    `  Z1–Z2 dohromady = pouze TF ${z12Min}–${z12Max} bpm (ne širší rozsah!)`,
    `  Referenční prahy: AeT ${userMetrics.AeT ?? '—'} bpm | ANP/LT ${userMetrics.ANP} bpm | TFmax ${userMetrics.HRmax} bpm`,
    '',
    'PŘÍKAZ PRO AI – VALIDACE TF:',
    '- NIKDY nepiš „Z1–Z2" pro TF mimo rozsahy Z1 a Z2 výše',
    `- Příklad: ${example142} – použij přesně tuto klasifikaci`,
    `- Příklad: ${example165} – NIKDY neoznačuj jako Z1–Z2`,
    '- Při návrhu targetHR v plánu MUSÍ hodnota spadat do deklarované zóny',
    '- Tempové zóny (min/km) a tepové zóny (BPM) jsou RŮZNÉ systémy – nepleť je',
  ].join('\n');
}

export function classifyHeartRateZone(hr: number, userMetrics: UserMetrics): string {
  return classifyBpmToHrZone(hr, userMetrics);
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
      ? `Tempové zóny (min/km) – oddělené od tepových:\n${paceZoneLines.join('\n')}`
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

export function buildMultiStageRaceWeekendRules(): string {
  return `## Víkendové etapové / vícekolové závody (POVINNÉ)

- Pokud sportovec hlásí N× stejně dlouhý závod o víkendu (např. 4 etapy OB), pracuj s PŘESNÝM počtem etap STEJNÉHO typu a formátu
- NEHALUCINUJ různé formáty (sprint vs dlouhá trať) – všechny etapy musí být konzistentní, pokud to sportovec neřekne jinak
- Každou etapu plánuj samostatně v update_calendar_workouts se stejným raceDetails (typ, délka, TF)
- Distribuuj síly: první etapy plná intenzita dle plánu, poslední etapy úsporněji (nižší TF, kratší rozcvička)
- Mezi etapami vyžaduj regeneraci (Z1), dostatek spánku a glykogen – kritizuj back-to-back maximální intenzitu bez odpočinku
- V odpovědi uveď přehled všech etap víkendu den po dni s TF v souladu s tepovými zónami sportovce`;
}
