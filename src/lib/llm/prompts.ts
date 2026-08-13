import { buildEnhancedAthleteProfile } from '@/lib/athleteProfileContext';
import { buildIntervalDescription } from '@/lib/intervalBuilder';
import { formatWorkoutExtrasForAi, getPlannedWorkoutTotalDistanceKm } from '@/lib/workoutExtras';
import { dayToLegacySessions, normalizeDayData } from '@/lib/dayData';
import {
  formatStravaActualDetailsForAi,
  summarizeStravaActualForAi,
} from '@/lib/stravaAnalysis';
import type { RecalculateRequest, UserMetrics } from '@/types/api';
import type { DayData, PlannedWorkout, WorkoutSession } from '@/types/training';

/** Detailní kontext kalendáře za posledních 14 dní */
export function buildFullCalendarContext(days: DayData[]): string {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return 'Žádná kalendářní data k dispozici.';
  }

  return sorted
    .map((day) => {
      const normalized = normalizeDayData(day);
      const sessionLines = [
        ...normalized.plannedWorkouts.map((w) => formatPlannedWorkoutLine(w)),
        ...normalized.activities.map(
          (a) =>
            `- [${a.phase ?? '?'}] ${a.title} (actual/Strava) | ${a.distanceKm} km @ ${a.avgPace}, HR ${a.avgHR}`,
        ),
      ].join('\n');

      const feedbackLine = formatFeedbackLine(day);

      return [`### ${day.date}`, sessionLines, feedbackLine]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function formatPlannedWorkoutLine(workout: PlannedWorkout): string {
  const planParts: string[] = [];
  const totalKm = getPlannedWorkoutTotalDistanceKm(workout);
  if (totalKm > 0) planParts.push(`${totalKm} km celkem`);
  else if (workout.distanceKm !== undefined) planParts.push(`${workout.distanceKm} km`);
  if (workout.targetPace) planParts.push(`@${workout.targetPace}`);
  if (workout.targetHR) planParts.push(`TF ${workout.targetHR}`);

  let line = `- [${workout.phase}] ${workout.title} (${workout.type}) | plán: ${planParts.join(' ') || workout.description.slice(0, 60)}`;

  if (workout.intervals?.length) {
    line += ` | intervaly: ${workout.intervals.map((i) => buildIntervalDescription(i)).join('; ')}`;
  } else if (workout.description) {
    line += ` | ${workout.description.slice(0, 120)}`;
  }

  if (workout.isLocked) line += ' 🔒 LOCKED';
  line += formatWorkoutExtrasForAi(workout);
  return line;
}

function formatSessionLine(session: WorkoutSession): string {
  const planParts: string[] = [];
  if (session.planned.distanceKm !== undefined) {
    planParts.push(`${session.planned.distanceKm} km`);
  }
  if (session.planned.targetPace) planParts.push(`@${session.planned.targetPace}`);
  if (session.planned.targetHR) planParts.push(`TF ${session.planned.targetHR}`);

  const planStr = planParts.length > 0 ? planParts.join(' ') : session.planned.description.slice(0, 60);

  let line = `- [${session.phase}] ${session.title} (${session.type}) | plán: ${planStr}`;

  if (session.actual) {
    line += ` | actual: ${session.actual.distanceKm} km @ ${session.actual.avgPace}, HR ${session.actual.avgHR} [${session.actual.garminSyncStatus}]`;

    const summary = summarizeStravaActualForAi(session.actual);
    if (summary) {
      line += ` | Strava: ${summary}`;
    }

    const details = formatStravaActualDetailsForAi(session.actual);
    if (details) {
      line += ` | ${details}`;
    }
  }

  if (session.isLocked) line += ' 🔒 LOCKED';
  if (session.planned.bookReference) {
    line += ` | metodika: ${session.planned.bookReference.bookTitle} ${session.planned.bookReference.chapterOrPage}`;
  }

  return line;
}

function formatFeedbackLine(day: DayData): string {
  const fb = day.feedback;
  if (!fb) return '';

  const parts: string[] = [];
  if (fb.readinessScore !== undefined) parts.push(`readiness=${fb.readinessScore}/10`);
  if (fb.userComment) parts.push(`komentář: "${fb.userComment}"`);

  return parts.length > 0 ? `Feedback: ${parts.join(', ')}` : '';
}

export function buildUserProfileContext(
  userMetrics: UserMetrics,
  readinessScore?: number,
): string {
  const profile = buildEnhancedAthleteProfile(userMetrics);
  if (readinessScore === undefined) return profile;
  return `${profile}\nAktuální ranní únava (readiness): ${readinessScore}/10`;
}

export function buildRecalculateUserPrompt(
  request: RecalculateRequest,
  methodicContext: string,
): string {
  const calendarContext = buildFullCalendarContext(request.historySummary);

  const lockedList = request.lockedSessions
    .map((s) => `- ${s.id}: ${s.title} (${s.type}, phase: ${s.phase}) – isLocked: true`)
    .join('\n');

  const futurePlan = Object.entries(request.currentDays)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => {
      const normalized = normalizeDayData({ ...day, date });
      const sessions = dayToLegacySessions(normalized)
        .map((s) => formatSessionLine(s))
        .join('\n');
      return `### ${date}\n${sessions}`;
    })
    .join('\n\n');

  const totalKm = request.historySummary.reduce((sum, day) => {
    const normalized = normalizeDayData(day);
    const fromActivities = normalized.activities.reduce((s, a) => s + a.distanceKm, 0);
    const fromPlanned = normalized.plannedWorkouts.reduce(
      (s, w) => s + getPlannedWorkoutTotalDistanceKm(w),
      0,
    );
    return sum + fromActivities + fromPlanned;
  }, 0);

  return `
Adaptuj tréninkový plán od data ${request.fromDate}.

## Profil sportovce
${buildUserProfileContext(request.userMetrics, request.readinessScore)}

## Metodický RAG kontext (JEDINÝ povolený zdroj teorie – nehalucinuj mimo něj)
${methodicContext}

## Historie kalendáře – posledních 14 dní (km, readiness, actual data)
Celkový objem za období: ~${totalKm.toFixed(1)} km

${calendarContext}

## Zamčené tréninky (NIKDY neměnit – vrátit identicky)
${lockedList || 'Žádné zamčené session'}

## Budoucí plán k adaptaci (od ${request.fromDate})
${futurePlan}

## Instrukce pro výstup
1. Používej POUZE pravidla z metodického RAG kontextu výše.
2. Pokud readinessScore >= 8: nejbližší 2 dny od ${request.fromDate} = regenerace (rest/mobility) dle metodiky.
3. isLocked: true session vrať beze změny.
4. Ke každému novému/upravenému tréninku vyplň bookReference (bookTitle, chapterOrPage, quote) z RAG kontextu, pokud je k dispozici – pole je volitelné.
5. Vrať POUZE objekt { "updatedDays": { ... } } – klíč updatedDays je povinný, každý den musí mít date shodné s klíčem záznamu.
`.trim();
}

/** Dynamické instrukce podle typu dotazu sportovce */
function buildQuerySpecificInstructions(message: string): string {
  const lower = message.toLowerCase();
  const isStructureQuery =
    /struktur|kvalit|polariz|zón|zon|distribuc|intenzit|objem|acwr|trend|makrocykl|periodiz|jak (mám|mi) (trénink|trenink|běh)/.test(
      lower,
    );
  const isPlanChangeQuery =
    /uprav|oprav|změn|zmen|přeplánuj|preplanuj|korek|nahraď|nahrad|vyměň|vymen/.test(lower);

  const parts: string[] = [];

  if (isStructureQuery) {
    parts.push(`### POVINNÁ STRUKTURA ODPOVĚDI (dotaz na kvalitu/strukturu tréninku)
Musíš explicitně zahrnout všechny body – neodpovídej obecně:
a) **Distribuce času v zónách** – konkrétní % v Z1–Z2 vs Z3–Z5 za poslední týdny (cituj data ze sekce Trenérská analytika / Time in Zones)
b) **Reálné odbehané běhy** – referuj konkrétní dny a hodnoty („Ve středu jsi běžel…") ze sekce Poslední běhy ze Stravy
c) **Soulad s cílem a fází** – porovnej strukturu s makrocyklem a cílovým závodem sportovce
d) **Verdikt** – jasné hodnocení (vhodná / riziková / nevhodná pro fázi) s edukativním vysvětlením a doporučením`);
  }

  if (isPlanChangeQuery) {
    parts.push(`### POVINNÝ FORMÁT PŘI ÚPRAVĚ PLÁNU
Neodpovídej suchým „Provedl jsem úpravy". Struktura odpovědi:
1. **Chyba v původním plánu** – konkrétní trénink (datum, typ, intenzita)
2. **Fyziologické riziko** – acidóza, glykogen, zranění, nervová únava, taper
3. **Co měníš a proč** – s odkazem na metodiku (Seiler/Canova/Daniels)
4. Teprve potom zavolej create_workout_plan`);
  }

  return parts.length > 0 ? parts.join('\n\n') : '';
}

export function buildChatUserPrompt(
  message: string,
  trainingLog: DayData[] | undefined,
  userMetrics?: UserMetrics,
  methodicContext?: string,
  visiblePeriod?: { from: string; to: string },
  historySummaries?: {
    stravaHistorySummary: string;
    longTermHistorySummary: string;
    macrocyclePhaseSummary: string;
    recentRunsDetail: string;
    currentWeekActualVsPlan: string;
    upcomingPlanSummary: string;
    planComparisonSummary: string;
  },
): string {
  const sortedLog = [...(trainingLog ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  const calendarContext = buildFullCalendarContext(sortedLog);
  const periodLine = visiblePeriod
    ? `Období kontextu: ${visiblePeriod.from} až ${visiblePeriod.to} (historie + budoucí plán)`
    : 'Období kalendáře: posledních 30 dní + nadcházející 3 týdny';

  const macrocycleBlock = historySummaries?.macrocyclePhaseSummary ?? '';
  const longTermBlock = historySummaries?.longTermHistorySummary ?? '';
  const recentRunsBlock = historySummaries?.recentRunsDetail ?? '';
  const stravaBlock = historySummaries?.stravaHistorySummary ?? '';
  const currentWeekBlock = historySummaries?.currentWeekActualVsPlan ?? '';
  const upcomingBlock = historySummaries?.upcomingPlanSummary ?? '';
  const comparisonBlock = historySummaries?.planComparisonSummary ?? '';
  const queryInstructions = buildQuerySpecificInstructions(message);

  return `
## Dotaz sportovce
${message}

${queryInstructions ? `${queryInstructions}\n\n` : ''}## Profil sportovce – zóny, cíle a fáze (VYHODNOCUJ TRÉNINKY STRIKTNĚ PODLE TĚCHTO ZÓN)
${userMetrics ? buildUserProfileContext(userMetrics) : 'N/A'}

${macrocycleBlock}

${longTermBlock}

${recentRunsBlock}

${stravaBlock}

${currentWeekBlock}

${upcomingBlock}

${comparisonBlock}

## Metodický RAG kontext (MULTI-SOURCE – syntetizuj minimálně 2–3 různé zdroje v každé odpovědi)
${methodicContext ?? 'Kontext nedostupný – odpověz, že chybí metodické podklady.'}

## Tréninkový kalendář – plánované i odtrénované tréninky (detail)
${periodLine}

${calendarContext}

## Instrukce pro analýzu
1. Primární metriky: čas v zónách (TiZ), polarizace, skladba tréninků, ACWR/trendy a makrocyklus – kilometráž je jen doplňkový kontext.
2. Vyhodnocuj každý běh podle individuálních tepových a tempových zón sportovce – uveď konkrétní zónu (např. „TF 135 = čistá Z1").
3. Hodnoť trénink v kontextu AKTUÁLNÍ FÁZE makrocyklu (zimní báze ≠ taper ≠ objemový blok).
4. Porovnej nadcházející plán s dlouhodobou historií i s přesným přehledem posledních odbehaných běhů ze Stravy – cituj konkrétní dny („Ve středu jsi běžel…").
5. Explicitně zohledni odjeté dny tohoto týdne (sekce aktuální týden) při analýze zbytku týdne.
6. Pokud detekuješ chybu, varuj ostře, edukuj a vysvětli fyziologické riziko – ne jen „to není ideální".
7. Při korekci plánu: NEJDŘÍV vysvětli chybu + riziko + důvod opravy, PAK zavolej create_workout_plan. Nikdy suché „Provedl jsem úpravy".
8. U intervalů, tempa a závodů vyplň warmUp/coolDown; u závodů raceDetails pro správný tapering.
9. V textu uveď konkrétní změny (např. „Úterý: změněno z 15×500m na 8 km Z2 regenerace – riziko acidózy před závodem").
10. Zamčené tréninky (isLocked) neměň ani nemaž.
`.trim();
}

export function findSessionDate(
  sessionId: string,
  days: Record<string, DayData>,
): string | undefined {
  return Object.keys(days).find((date) =>
    normalizeDayData(days[date]).plannedWorkouts.some((w) => w.id === sessionId),
  );
}

/** Zajistí, že zamčené session zůstanou beze změny i po LLM adaptaci */
export function enforceLockedSessions(
  updatedDays: Record<string, DayData>,
  currentDays: Record<string, DayData>,
  lockedSessions: WorkoutSession[],
): Record<string, DayData> {
  const merged = { ...updatedDays };

  for (const locked of lockedSessions) {
    const date = findSessionDate(locked.id, currentDays);
    if (!date) continue;

    const existingDay = normalizeDayData(merged[date] ?? currentDays[date]);
    if (!existingDay) continue;

    const lockedWorkout = existingDay.plannedWorkouts.find((w) => w.id === locked.id) ?? {
      id: locked.id,
      phase: locked.phase,
      title: locked.title,
      type: locked.type,
      isLocked: true,
      description: locked.planned.description,
      distanceKm: locked.planned.distanceKm,
      targetPace: locked.planned.targetPace,
      targetHR: locked.planned.targetHR,
      bookReference: locked.planned.bookReference,
    };

    merged[date] = {
      ...existingDay,
      date,
      plannedWorkouts: [
        ...existingDay.plannedWorkouts.filter((w) => w.id !== locked.id),
        { ...lockedWorkout, isLocked: true },
      ],
    };
  }

  return merged;
}

export function buildLlmSystemPrompt(
  basePrompt: string,
  methodicContext: string,
  coachNotesContext?: string,
): string {
  const notesBlock = coachNotesContext?.trim()
    ? `\n\n## ${coachNotesContext.trim()}`
    : '';

  return `${basePrompt}

## Přiložený metodický kontext (RAG)
${methodicContext}${notesBlock}`;
}
