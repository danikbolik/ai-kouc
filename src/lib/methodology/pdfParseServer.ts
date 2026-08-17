import { createRequire } from 'module';
import path from 'path';

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

  const require = createRequire(import.meta.url);
  const cjsPath = path.join(
    process.cwd(),
    'node_modules',
    'pdf-parse',
    'dist',
    'pdf-parse',
    'cjs',
    'index.cjs',
  );

  const pdfModule = require(cjsPath) as { PDFParse: PdfParseClass };

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
