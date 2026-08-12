import type { UploadedMethodology } from '@/types/settings';

/** Max. délka uloženého textu jednoho dokumentu (localStorage limit) */
export const MAX_METHODOLOGY_CHARS = 80_000;

/** Max. délka textu odeslaného do API v jednom dokumentu */
export const MAX_METHODOLOGY_API_CHARS = 30_000;

const TEXT_EXTENSIONS = ['.txt', '.md'];
const PDF_EXTENSION = '.pdf';

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[… text zkrácen na ${maxChars.toLocaleString('cs-CZ')} znaků …]`;
}

async function readTextFile(file: File): Promise<string> {
  return file.text();
}

async function readPdfFile(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');

  if (typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

export function isSupportedMethodologyFile(file: File): boolean {
  const ext = getExtension(file.name);
  return TEXT_EXTENSIONS.includes(ext) || ext === PDF_EXTENSION;
}

export async function readMethodologyFile(file: File): Promise<{
  fileType: UploadedMethodology['fileType'];
  content: string;
}> {
  const ext = getExtension(file.name);

  if (TEXT_EXTENSIONS.includes(ext)) {
    const raw = await readTextFile(file);
    return {
      fileType: ext === '.md' ? 'md' : 'txt',
      content: truncateContent(raw.trim(), MAX_METHODOLOGY_CHARS),
    };
  }

  if (ext === PDF_EXTENSION) {
    const raw = await readPdfFile(file);
    if (!raw.trim()) {
      throw new Error('PDF neobsahuje extrahovatelný text (možná naskenovaný dokument).');
    }
    return {
      fileType: 'pdf',
      content: truncateContent(raw.trim(), MAX_METHODOLOGY_CHARS),
    };
  }

  throw new Error('Nepodporovaný formát. Povolené: .pdf, .txt, .md');
}

export function createUploadedMethodology(
  fileName: string,
  fileType: UploadedMethodology['fileType'],
  content: string,
): UploadedMethodology {
  return {
    id: `methodology-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    fileType,
    uploadedAt: new Date().toISOString(),
    content,
    charCount: content.length,
  };
}

export function formatFileSize(chars: number): string {
  if (chars < 1000) return `${chars} znaků`;
  return `${(chars / 1000).toFixed(1)}k znaků`;
}
