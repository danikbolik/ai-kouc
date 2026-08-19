import fs from 'fs';
import path from 'path';

import { parseMethodologyBuffer } from '@/lib/methodology/parseServerFile';
import { buildFullMethodicLibraryContext } from '@/lib/ragKnowledge';

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf']);

/** Složky prohledávané při sestavení SYSTEM_METHODOLOGY_CONTEXT (v pořadí priority). */
const METHODOLOGY_SEARCH_DIRS = [
  path.join(process.cwd(), 'data', 'methodology'),
  path.join(process.cwd(), 'methodology'),
  path.join(process.cwd(), 'knowledge'),
];

interface MethodologyFileEntry {
  rootLabel: string;
  relativePath: string;
  absolutePath: string;
}

function getFallbackMethodologyContext(reason: string): string {
  return [
    `## Záložní metodický kontext (lokální soubory nebyly načteny: ${reason})`,
    buildFullMethodicLibraryContext(),
  ].join('\n\n');
}

function collectMethodologyFiles(dir: string, rootLabel: string): MethodologyFileEntry[] {
  const entries: MethodologyFileEntry[] = [];

  if (!fs.existsSync(dir)) {
    return entries;
  }

  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      entries.push({
        rootLabel,
        relativePath: path.relative(dir, absolutePath).replace(/\\/g, '/'),
        absolutePath,
      });
    }
  };

  walk(dir);
  return entries;
}

function discoverMethodologyFiles(): MethodologyFileEntry[] {
  const seenPaths = new Set<string>();
  const allFiles: MethodologyFileEntry[] = [];

  for (const dir of METHODOLOGY_SEARCH_DIRS) {
    const rootLabel = path.relative(process.cwd(), dir).replace(/\\/g, '/') || dir;
    for (const file of collectMethodologyFiles(dir, rootLabel)) {
      if (seenPaths.has(file.absolutePath)) continue;
      seenPaths.add(file.absolutePath);
      allFiles.push(file);
    }
  }

  return allFiles.sort((a, b) => {
    const byRoot = a.rootLabel.localeCompare(b.rootLabel, 'cs');
    if (byRoot !== 0) return byRoot;
    return a.relativePath.localeCompare(b.relativePath, 'cs');
  });
}

async function readMethodologyFileContent(entry: MethodologyFileEntry): Promise<string | null> {
  const label = `${entry.rootLabel}/${entry.relativePath}`;

  try {
    const buffer = fs.readFileSync(entry.absolutePath);
    const { content } = await parseMethodologyBuffer(buffer, entry.relativePath);

    if (!content.trim()) {
      return `### ${label}\n(prázdný soubor)`;
    }

    return `### ${label}\n${content.trim()}`;
  } catch (error) {
    console.warn(
      `[loadSystemMethodologyContext] Nepodařilo se načíst "${label}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Načte VŠECHNY .txt, .md a .pdf soubory z metodických složek projektu
 * (rekurzivně) a spojí je do jednoho kontextu pro system prompt.
 */
export async function loadSystemMethodologyContext(): Promise<string> {
  try {
    const files = discoverMethodologyFiles();

    if (files.length === 0) {
      return getFallbackMethodologyContext(
        'žádné soubory v data/methodology, methodology ani knowledge',
      );
    }

    const sections: string[] = [];

    for (const file of files) {
      const section = await readMethodologyFileContent(file);
      if (section) sections.push(section);
    }

    if (sections.length === 0) {
      return getFallbackMethodologyContext('všechny soubory selhaly při načítání');
    }

    return sections.join('\n\n');
  } catch (error) {
    console.error('[loadSystemMethodologyContext] Fatální chyba:', error);
    return getFallbackMethodologyContext(
      error instanceof Error ? error.message : 'neočekávaná chyba',
    );
  }
}

/** @deprecated Použij loadSystemMethodologyContext */
export async function getMethodologyContext(): Promise<string> {
  return loadSystemMethodologyContext();
}

/** Vrátí seznam názvů metodických souborů (pro logování / debug) */
export function listMethodologyFiles(): string[] {
  return discoverMethodologyFiles().map((file) => `${file.rootLabel}/${file.relativePath}`);
}
