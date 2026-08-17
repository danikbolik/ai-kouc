import fs from 'fs';
import path from 'path';

import { parsePdfBuffer } from '@/lib/methodology/pdfParseServer';
import { buildFullMethodicLibraryContext } from '@/lib/ragKnowledge';

const METHODOLOGY_DIR = path.join(process.cwd(), 'data', 'methodology');
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf']);

function getFallbackMethodologyContext(reason: string): string {
  return [
    `## Záložní metodický kontext (lokální PDF/soubory nebyly načteny: ${reason})`,
    buildFullMethodicLibraryContext(),
  ].join('\n\n');
}

function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8').trim();
}

async function readPdfFile(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return parsePdfBuffer(buffer);
}

async function readMethodologyFileContent(
  fileName: string,
  filePath: string,
): Promise<string | null> {
  const ext = path.extname(fileName).toLowerCase();

  try {
    const content = ext === '.pdf' ? await readPdfFile(filePath) : readTextFile(filePath);

    if (!content) {
      return `### Soubor: ${fileName}\n(prázdný soubor)`;
    }

    return `### Soubor: ${fileName}\n${content}`;
  } catch (error) {
    console.warn(
      `[getMethodologyContext] Nepodařilo se načíst soubor "${fileName}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Načte všechny .txt, .md a .pdf soubory ze složky data/methodology
 * a spojí je do jednoho metodického kontextu pro AI prompty.
 */
export async function getMethodologyContext(): Promise<string> {
  try {
    if (!fs.existsSync(METHODOLOGY_DIR)) {
      console.warn(`[getMethodologyContext] Složka neexistuje: ${METHODOLOGY_DIR}`);
      return getFallbackMethodologyContext('složka data/methodology neexistuje');
    }

    const fileNames = fs
      .readdirSync(METHODOLOGY_DIR)
      .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'cs'));

    if (fileNames.length === 0) {
      return getFallbackMethodologyContext('žádné metodické soubory (.txt, .md, .pdf)');
    }

    const sections: string[] = [];

    for (const fileName of fileNames) {
      const filePath = path.join(METHODOLOGY_DIR, fileName);
      const section = await readMethodologyFileContent(fileName, filePath);
      if (section) {
        sections.push(section);
      }
    }

    if (sections.length === 0) {
      return getFallbackMethodologyContext('všechny soubory selhaly při načítání');
    }

    return sections.join('\n\n');
  } catch (error) {
    console.error('[getMethodologyContext] Fatální chyba:', error);
    return getFallbackMethodologyContext(
      error instanceof Error ? error.message : 'neočekávaná chyba',
    );
  }
}

/** Vrátí seznam názvů metodických souborů (pro logování / debug) */
export function listMethodologyFiles(): string[] {
  if (!fs.existsSync(METHODOLOGY_DIR)) return [];

  return fs
    .readdirSync(METHODOLOGY_DIR)
    .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'cs'));
}
