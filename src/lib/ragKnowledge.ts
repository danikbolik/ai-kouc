import { generateMockReply } from './chatMock';
import type { ChatReference, ChatRequest, ChatResponse } from '../types/api';
import type { DayData } from '../types/training';

export interface KnowledgeChunk {
  id: string;
  bookTitle: string;
  chapterOrPage: string;
  quote: string;
  keywords: string[];
}

/** Simulovaná vektorová databáze metodických dokumentů */
export const KNOWLEDGE_BASE: KnowledgeChunk[] = [
  {
    id: 'daniels-threshold',
    bookTitle: "Daniels' Running Formula",
    chapterOrPage: 'Kapitola 4, s. 112',
    quote: 'Prahový běh má být na úrovni 88–92 % TFmax.',
    keywords: ['prahov', 'tempo', 'threshold', 'tfmax', 'anp'],
  },
  {
    id: 'daniels-intervals',
    bookTitle: "Daniels' Running Formula",
    chapterOrPage: 'Kapitola 5, s. 89',
    quote: 'Intervaly I-fáze rozvíjejí VO₂max – délka úseku 3–5 minut.',
    keywords: ['interval', 'vo2', 'rychl', 'sprint'],
  },
  {
    id: 'daniels-illness',
    bookTitle: "Daniels' Running Formula",
    chapterOrPage: 'Kapitola 12, s. 198',
    quote: 'Nikdy netrénuj s horečkou nebo bolestí v hrudi.',
    keywords: ['nemoc', 'nachlazen', 'infekce', 'horečka', 'upravit plán'],
  },
  {
    id: 'uphill-longrun',
    bookTitle: 'Training for the Uphill Athlete',
    chapterOrPage: 'Kapitola 8, s. 156',
    quote: 'Dlouhý běh by měl tvořit 20–30 % týdenního objemu.',
    keywords: ['longrun', 'dlouh', 'objem', 'vytrval'],
  },
  {
    id: 'uphill-taper',
    bookTitle: 'Training for the Uphill Athlete',
    chapterOrPage: 'Kapitola 8, s. 162',
    quote: 'Poslední longrun by měl být 3 týdny před závodem.',
    keywords: ['taper', 'závod', 'race', 'závody'],
  },
  {
    id: 'daniels-recovery',
    bookTitle: "Daniels' Running Formula",
    chapterOrPage: 'Kapitola 3, s. 67',
    quote: 'Regenerační trénink musí být skutečně lehký – pod 70 % TFmax.',
    keywords: ['únava', 'regener', 'recovery', 'týden', 'vyhodnoť', 'readiness'],
  },
  {
    id: 'seiler-polarized',
    bookTitle: 'Seiler – Polarized Training',
    chapterOrPage: 'Kapitola 2, s. 45',
    quote: 'Elitní vytrvalci trénují ~80 % objemu v nízké intenzitě (Z1–Z2) a ~20 % vysoké intenzity.',
    keywords: ['polariz', 'z2', 'objem', 'intenzit', '80/20', 'vytrval'],
  },
  {
    id: 'seiler-interval-spacing',
    bookTitle: 'Seiler – Polarized Training',
    chapterOrPage: 'Kapitola 4, s. 78',
    quote: 'Vysoce intenzivní trénink vyžaduje minimálně 48 hodin regenerace před další hard session.',
    keywords: ['interval', 'regener', 'recovery', 'vo2', 'hard', 'únava'],
  },
  {
    id: 'canova-progression',
    bookTitle: 'Renato Canova – Marathon Training',
    chapterOrPage: 'Kapitola 6, s. 134',
    quote: 'Progrese objemu nesmí překročit 10–15 % týdně – jinak hrozí přetrénování a zranění.',
    keywords: ['objem', 'longrun', 'progres', 'kilometráž', 'týden', 'zranění'],
  },
  {
    id: 'canova-specific',
    bookTitle: 'Renato Canova – Marathon Training',
    chapterOrPage: 'Kapitola 9, s. 201',
    quote: 'Specifický trénink musí kopírovat požadavky závodu – tempo, profil, délku.',
    keywords: ['tempo', 'maraton', 'závod', 'race', 'specif'],
  },
  {
    id: 'bakken-consistency',
    bookTitle: 'Erik Bakken – Consistency First',
    chapterOrPage: 'Kapitola 3, s. 58',
    quote: 'Konzistence v easy objemu je důležitější než občas extrémní trénink.',
    keywords: ['objem', 'easy', 'klus', 'konzist', 'regener'],
  },
  {
    id: 'bakken-injury',
    bookTitle: 'Erik Bakken – Consistency First',
    chapterOrPage: 'Kapitola 7, s. 142',
    quote: 'Skok v délce longrunu o více než 25 % oproti dosavadnímu maximu je primární riziko zranění.',
    keywords: ['longrun', 'zranění', 'dlouh', 'objem', 'rizik'],
  },
  {
    id: 'uphill-glycogen',
    bookTitle: 'Training for the Uphill Athlete',
    chapterOrPage: 'Kapitola 5, s. 98',
    quote: 'Dlouhý běh vyčerpává glykogen – následující 24–48 h vyžadují regeneraci, ne další hard session.',
    keywords: ['longrun', 'glykogen', 'regener', 'laktát', 'interval'],
  },
];

/** Výchozí počet chunků pro chat RAG – multi-source syntéza */
export const CHAT_RAG_TOP_K = 12;
export const RECALCULATE_RAG_TOP_K = 10;

/** Vybere top-k chunků s prioritou diverzity zdrojů (více knih najednou) */
export function searchKnowledge(query: string, topK = CHAT_RAG_TOP_K): KnowledgeChunk[] {
  const normalized = query.toLowerCase();

  const scored = KNOWLEDGE_BASE.map((chunk) => {
    const score = chunk.keywords.reduce(
      (sum, kw) => sum + (normalized.includes(kw) ? 1 : 0),
      0,
    );
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);

  const matched = scored.filter(({ score }) => score > 0);
  const pool = matched.length > 0 ? matched : scored.map(({ chunk }) => ({ chunk, score: 0 }));

  const selected: KnowledgeChunk[] = [];
  const usedIds = new Set<string>();
  const bookCounts = new Map<string, number>();

  while (selected.length < topK) {
    let picked = false;

    for (const { chunk } of pool) {
      if (usedIds.has(chunk.id)) continue;
      const count = bookCounts.get(chunk.bookTitle) ?? 0;
      if (count >= 2) continue;

      selected.push(chunk);
      usedIds.add(chunk.id);
      bookCounts.set(chunk.bookTitle, count + 1);
      picked = true;
      if (selected.length >= topK) break;
    }

    if (!picked) {
      for (const { chunk } of pool) {
        if (usedIds.has(chunk.id)) continue;
        selected.push(chunk);
        usedIds.add(chunk.id);
        if (selected.length >= topK) break;
      }
      break;
    }
  }

  return selected;
}

export function chunksToReferences(chunks: KnowledgeChunk[]): ChatReference[] {
  return chunks.map((c) => ({
    bookTitle: c.bookTitle,
    chapterOrPage: c.chapterOrPage,
    quote: c.quote,
  }));
}

export function generateChatResponse(
  request: ChatRequest,
  days: Record<string, DayData>,
): ChatResponse {
  const ragChunks = searchKnowledge(request.message);
  const mockReply = generateMockReply(request.message, days);

  const ragReferences = chunksToReferences(ragChunks);
  const existingRefs =
    mockReply.dynamicReferences
      ?.filter((r) => r.type === 'book' && r.bookTitle && r.chapterOrPage && r.quote)
      .map((r) => ({
        bookTitle: r.bookTitle!,
        chapterOrPage: r.chapterOrPage!,
        quote: r.quote!,
      })) ?? [];

  const mergedRefs = [...existingRefs];
  for (const ref of ragReferences) {
    if (!mergedRefs.some((r) => r.chapterOrPage === ref.chapterOrPage)) {
      mergedRefs.push(ref);
    }
  }

  return {
    replyText: mockReply.text,
    references: mergedRefs.slice(0, 4),
  };
}

/** Připraví RAG kontext pro LLM prompt (chat) – multi-source */
export function buildChatRagContext(query: string): string {
  const chunks = searchKnowledge(query, CHAT_RAG_TOP_K);
  return formatChunksAsContext(chunks);
}

/** Připraví RAG kontext pro přepočet plánu – širší výběr metodických výňatků */
export function buildRecalculateRagContext(readinessScore: number): string {
  const query = [
    'regenerace únava recovery periodizace',
    readinessScore >= 8 ? 'přetížení overtraining odpočinek' : 'adaptace zátěž',
    'prahový tempo interval longrun objem',
  ].join(' ');

  const chunks = searchKnowledge(query, RECALCULATE_RAG_TOP_K);
  const baseline = KNOWLEDGE_BASE.filter(
    (c) => !chunks.some((existing) => existing.id === c.id),
  ).slice(0, 2);

  return formatChunksAsContext([...chunks, ...baseline]);
}

/** Vrátí kompletní metodickou knihovnu pro maximální kontext */
export function buildFullMethodicLibraryContext(): string {
  return formatChunksAsContext(KNOWLEDGE_BASE);
}

function formatChunksAsContext(chunks: KnowledgeChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.bookTitle} – ${c.chapterOrPage}\nCitace: "${c.quote}"`,
    )
    .join('\n\n');
}
