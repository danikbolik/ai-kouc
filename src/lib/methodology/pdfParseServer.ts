import { createRequire } from 'module';

/** pdfjs na Node.js vyžaduje DOMMatrix – polyfill pro server-side parsování (lokální soubory). */
function ensureDomMatrixPolyfill(): void {
  if (typeof globalThis.DOMMatrix !== 'undefined') return;

  globalThis.DOMMatrix = class {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }

    multiply() {
      return this;
    }

    inverse() {
      return this;
    }

    transformPoint(point: { x: number; y: number }) {
      return point;
    }
  } as unknown as typeof DOMMatrix;
}

type PdfParseClass = new (options: { data: Buffer }) => {
  getText: () => Promise<{ text?: string }>;
  destroy: () => Promise<void>;
};

let cachedPdfParseClass: PdfParseClass | null = null;

/** Server-safe pdf-parse (CJS) – nebrowser ESM export vyžadující DOMMatrix. */
export function loadPdfParseClass(): PdfParseClass {
  if (cachedPdfParseClass) {
    return cachedPdfParseClass;
  }

  ensureDomMatrixPolyfill();

  const require = createRequire(import.meta.url);
  const pdfModule = require('pdf-parse') as { PDFParse: PdfParseClass };

  if (!pdfModule?.PDFParse) {
    throw new Error('PDFParse export not found in pdf-parse CJS bundle');
  }

  cachedPdfParseClass = pdfModule.PDFParse;
  return cachedPdfParseClass;
}

export async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  const PDFParse = loadPdfParseClass();
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return (result.text ?? '').trim();
  } finally {
    await parser.destroy();
  }
}
