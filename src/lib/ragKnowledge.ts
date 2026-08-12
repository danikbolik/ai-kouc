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
];

/** Simuluje RAG vector search – vrací top-k relevantní chunky */
export function searchKnowledge(query: string, topK = 3): KnowledgeChunk[] {
  const normalized = query.toLowerCase();

  const scored = KNOWLEDGE_BASE.map((chunk) => {
    const score = chunk.keywords.reduce(
      (sum, kw) => sum + (normalized.includes(kw) ? 1 : 0),
      0,
    );
    return { chunk, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return KNOWLEDGE_BASE.slice(0, topK);
  }

  return scored.slice(0, topK).map(({ chunk }) => chunk);
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

/** Připraví RAG kontext pro LLM prompt (chat) */
export function buildChatRagContext(query: string): string {
  const chunks = searchKnowledge(query, 5);
  return formatChunksAsContext(chunks);
}

/** Připraví RAG kontext pro přepočet plánu – širší výběr metodických výňatků */
export function buildRecalculateRagContext(readinessScore: number): string {
  const query = [
    'regenerace únava recovery periodizace',
    readinessScore >= 8 ? 'přetížení overtraining odpočinek' : 'adaptace zátěž',
    'prahový tempo interval longrun objem',
  ].join(' ');

  const chunks = searchKnowledge(query, 6);
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
