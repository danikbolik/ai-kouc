import fs from 'fs';
import path from 'path';

import { buildFullMethodicLibraryContext } from '@/lib/ragKnowledge';

export const METODIKA_SUMAR_FILENAME = 'METODIKA_SUMAR.txt';

const METODIKA_SUMAR_PATH = path.join(process.cwd(), METODIKA_SUMAR_FILENAME);

function getFallbackMethodologyContext(reason: string): string {
  return [
    `## Záložní metodický kontext (${METODIKA_SUMAR_FILENAME} nebyl načten: ${reason})`,
    buildFullMethodicLibraryContext(),
  ].join('\n\n');
}

/**
 * Načte hlavní metodický podklad pro chat – výhradně METODIKA_SUMAR.txt v kořeni projektu.
 */
export async function loadSystemMethodologyContext(): Promise<string> {
  try {
    if (!fs.existsSync(METODIKA_SUMAR_PATH)) {
      console.warn(`[loadSystemMethodologyContext] Soubor neexistuje: ${METODIKA_SUMAR_PATH}`);
      return getFallbackMethodologyContext('soubor v kořeni projektu neexistuje');
    }

    const content = fs.readFileSync(METODIKA_SUMAR_PATH, 'utf-8').trim();
    if (!content) {
      return getFallbackMethodologyContext('soubor je prázdný');
    }

    return content;
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

/** Vrátí cestu k načtenému souboru (pro logování / debug) */
export function getMethodologySummaryPath(): string {
  return METODIKA_SUMAR_PATH;
}

/** @deprecated Použij getMethodologySummaryPath */
export function listMethodologyFiles(): string[] {
  return fs.existsSync(METODIKA_SUMAR_PATH) ? [METODIKA_SUMAR_FILENAME] : [];
}
