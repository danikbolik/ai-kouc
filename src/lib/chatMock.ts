import { dayToLegacySessions, normalizeDayData } from './dayData';
import { addDaysToDate, formatDateKey, parseDate } from './dates';
import { getTodayDate } from './dates';
import type { DynamicReference } from '../types/chat';
import type { DayData } from '../types/training';

interface MockReply {
  text: string;
  dynamicReferences?: DynamicReference[];
}

function getTomorrowDate(): string {
  return formatDateKey(addDaysToDate(parseDate(getTodayDate()), 1));
}

function getLastWeekDays(days: Record<string, DayData>): DayData[] {
  const today = parseDate(getTodayDate());
  return Array.from({ length: 7 }, (_, i) => {
    const date = formatDateKey(addDaysToDate(today, -(6 - i)));
    return days[date];
  }).filter(Boolean);
}

function formatSessionSummary(day: DayData): string {
  return dayToLegacySessions(normalizeDayData(day))
    .map((s) => `${s.type}${s.planned.distanceKm ? ` ${s.planned.distanceKm} km` : ''}`)
    .join(', ');
}

export function generateMockReply(
  userMessage: string,
  days: Record<string, DayData>,
): MockReply {
  const normalized = userMessage.toLowerCase().trim();
  const today = getTodayDate();
  const tomorrow = getTomorrowDate();
  const tomorrowDay = days[tomorrow];
  const todayDay = days[today];

  if (
    normalized.includes('zítra') ||
    normalized.includes('prahov') ||
    normalized.includes('proč mám')
  ) {
    const sessions = tomorrowDay ? dayToLegacySessions(normalizeDayData(tomorrowDay)) : [];
    const mainSession = sessions[0];

    if (!mainSession) {
      return {
        text: 'Na zítřek (**' + tomorrow + '**) nemám v plánu žádnou tréninkovou jednotku. Zkontroluj kalendář nebo požádej o přegenerování plánu.',
      };
    }

    const isTempo = mainSession.type === 'tempo';
    const isLongrun = mainSession.type === 'longrun';

    return {
      text: [
        `### Proč právě tento trénink na zítra?`,
        '',
        `Na **${tomorrow}** máš naplánováno: **${mainSession.title}** (${mainSession.type.toUpperCase()}).`,
        '',
        mainSession.planned.description,
        '',
        isTempo
          ? 'Prahový běh dává smysl v kontextu tvého **Prahového bloku** – rozvíjíš schopnost udržet závodní tempo bez přechodu do anaerobní zóny.'
          : isLongrun
            ? 'Dlouhý běh je klíčový pro budování aerobní kapacity. V tomto cyklu tvoří ~25 % týdenního objemu.'
            : 'Tento trénink navazuje na předchozí zátěž a respektuje tvůj aktuální tréninkový blok.',
        '',
        `**Plán:** ${mainSession.planned.distanceKm ?? '—'} km @ ${mainSession.planned.targetPace ?? 'volné tempo'}, cílová TF ${mainSession.planned.targetHR ?? '—'} bpm.`,
        '',
        todayDay?.feedback?.readinessScore
          ? `Vzhledem k dnešnímu readiness skóre **${todayDay.feedback.readinessScore}/10** doporučuji trénink absolvovat segway – bez tlačení na maximum.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      dynamicReferences: mainSession.planned.bookReference
        ? [
            {
              type: 'book',
              label: `Zdroj: ${mainSession.planned.bookReference.bookTitle.includes('Daniels') ? 'Daniels' : mainSession.planned.bookReference.bookTitle} ${mainSession.planned.bookReference.chapterOrPage}`,
              bookTitle: mainSession.planned.bookReference.bookTitle,
              chapterOrPage: mainSession.planned.bookReference.chapterOrPage,
              quote: mainSession.planned.bookReference.quote,
            },
            {
              type: 'workout',
              label: `Trénink: ${tomorrow}`,
              date: tomorrow,
              sessionTitle: mainSession.title,
            },
          ]
        : [
            {
              type: 'workout',
              label: `Trénink: ${tomorrow} – ${mainSession.title}`,
              date: tomorrow,
              sessionTitle: mainSession.title,
            },
          ],
    };
  }

  if (normalized.includes('týden') || normalized.includes('únava') || normalized.includes('vyhodnoť')) {
    const weekDays = getLastWeekDays(days);
    const readinessValues = weekDays
      .map((d) => d.feedback?.readinessScore)
      .filter((v): v is number => v !== undefined);
    const totalKm = weekDays.reduce((sum, d) => {
      const normalized = normalizeDayData(d);
      const fromActivities = normalized.activities.reduce((s, a) => s + a.distanceKm, 0);
      const fromSessions = dayToLegacySessions(normalized).reduce(
        (s, session) =>
          s + (session.actual?.distanceKm ?? session.planned.distanceKm ?? 0),
        0,
      );
      return sum + fromActivities + fromSessions;
    }, 0);

    const daySummaries = weekDays
      .map((d) => `- **${d.date}**: ${formatSessionSummary(d)}`)
      .join('\n');

    const lastReadiness = readinessValues.length > 0 ? readinessValues[readinessValues.length - 1] : null;

    return {
      text: [
        '### Vyhodnocení posledního týdne',
        '',
        '**Shrnutí objemu:** ~' + totalKm.toFixed(0) + ' km za 7 dní',
        lastReadiness !== null ? '**Readiness:** Poslední hodnota ' + lastReadiness + '/10' : '',
        '',
        '**Denní přehled:**',
        daySummaries,
        '',
        lastReadiness !== null && lastReadiness >= 8
          ? '⚠️ Elevovaná ranní únava. Doporučuji **lehčí regenerační týden** nebo snížení objemu o 15–20 %.'
          : '✅ Týden vypadá vyváženě. Pokračuj v aktuálním plánu s pozorností na signály únavy.',
        '',
        weekDays.some((d) => d.feedback?.userComment)
          ? '*Poznámka: Zohlednil jsem i tvé textové komentáře z feedbacku.*'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      dynamicReferences: [
        {
          type: 'workout',
          label: '14 dní tréninkové historie',
          date: today,
        },
      ],
    };
  }

  if (normalized.includes('nachlazen') || normalized.includes('upravit plán') || normalized.includes('nemoc')) {
    return {
      text: [
        '### Úprava plánu při nachlazení',
        '',
        'Při **mírném nachlazení** (bez horečky, bez bolesti na hrudi) platí pravidlo **„neck above the belt"**:',
        '',
        '- **1.–2. den:** Kompletní rest nebo lehká procházka',
        '- **3.–4. den:** Návrat klusy (max 30 min, TF < 130 bpm)',
        '- **5.+ den:** Postupné navýšení, první intervaly až po 7 dnech bez symptomů',
        '',
        '**Konkrétní doporučení pro tvůj plán:**',
        '- Zítřejší jednotku **přesuň nebo nahraď** lehkým klusem 20–30 min',
        '- Zamkni 🔒 klíčové závodní session, aby AI adaptace nezasahovala do taperu',
        '- Sleduj ranní readiness – pokud ≥ 8/10 tři dny po sobě, spusť přepočet plánu',
        '',
        '> *„Trénink v akutní fázi infekce prodlouží recovery o 2–3× déle než samotný odpočinek."*',
      ].join('\n'),
      dynamicReferences: [
        {
          type: 'book',
          label: 'Zdroj: Daniels – Kapitola 12, s. 198',
          bookTitle: "Daniels' Running Formula",
          chapterOrPage: 'Kapitola 12, s. 198',
          quote: 'Nikdy netrénuj s horečkou nebo bolestí v hrudi.',
        },
      ],
    };
  }

  return {
    text: [
      'Díky za dotaz. Jsem tvůj **metodický AI konzultant** – odpovídám na základě:',
      '',
      '- 📚 Indexované knihy: *Daniels\' Running Formula*, *Training for the Uphill Athlete*',
      '- 📅 14 dní tréninkové historie + aktuální plán',
      '- 💬 Tvůj feedback (readiness, komentáře)',
      '',
      'Zeptej se mě na konkrétní trénink, vyhodnocení týdne, nebo úpravu plánu. Použij rychlé dotazy níže pro inspiraci.',
    ].join('\n'),
  };
}
