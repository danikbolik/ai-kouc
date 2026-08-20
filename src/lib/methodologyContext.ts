import {
  buildChatRagContext,
  buildFullMethodicLibraryContext,
  buildRecalculateRagContext,
} from '@/lib/ragKnowledge';
import { MAX_METHODOLOGY_API_CHARS } from '@/lib/readMethodologyFile';
import type { UploadedMethodology } from '@/types/settings';

function truncateForApi(content: string): string {
  if (content.length <= MAX_METHODOLOGY_API_CHARS) return content;
  return `${content.slice(0, MAX_METHODOLOGY_API_CHARS)}\n[… zkráceno pro API …]`;
}

/** Formátuje nahrané metodické podklady jako primární RAG kontext */
export function formatUploadedMethodology(
  documents?: UploadedMethodology[],
): string | null {
  if (!documents?.length) return null;

  const sections = documents.map((doc, index) => {
    const typeLabel = doc.fileType.toUpperCase();
    return `### [${index + 1}] ${doc.fileName} (${typeLabel}, ${doc.charCount.toLocaleString('cs-CZ')} znaků)
${truncateForApi(doc.content)}`;
  });

  return `## Nahrané metodické podklady (primární zdroj – používej přednostně)
${sections.join('\n\n')}`;
}

/** Pouze nahrané podklady uživatele (Supabase) – bez vestavěné RAG knihovny. */
export function buildUploadedMethodologyContext(
  documents?: UploadedMethodology[],
): string {
  return formatUploadedMethodology(documents) ?? '';
}

export function buildMethodicContext(options: {
  localMethodologyContext?: string;
  uploadedMethodology?: UploadedMethodology[];
  query?: string;
  readinessScore?: number;
  includeFullLibrary?: boolean;
}): string {
  const parts: string[] = [];

  if (options.localMethodologyContext?.trim()) {
    parts.push(
      `## Metodické podklady ze složky projektu (primární zdroj – data/methodology)\n${options.localMethodologyContext.trim()}`,
    );
  }

  const uploadContext = formatUploadedMethodology(options.uploadedMethodology);
  if (uploadContext) {
    parts.push(uploadContext);
  }

  const builtinContext = options.query
    ? buildChatRagContext(options.query)
    : buildRecalculateRagContext(options.readinessScore ?? 5);

  const fullLibrary = options.includeFullLibrary
    ? buildFullMethodicLibraryContext()
    : null;

  if (parts.length > 0) {
    parts.push(`## Vestavěná metodická knihovna (doplňková)\n${builtinContext}`);
    if (fullLibrary) {
      parts.push(`## Kompletní vestavěná knihovna\n${fullLibrary}`);
    }
    return parts.join('\n\n');
  }

  if (fullLibrary) {
    return `${builtinContext}\n\n## Doplňková metodická knihovna\n${fullLibrary}`;
  }

  return builtinContext;
}
