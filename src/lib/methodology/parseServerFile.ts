import { MAX_METHODOLOGY_CHARS } from '@/lib/readMethodologyFile';
import type { UploadedMethodology } from '@/types/settings';
import { parsePdfBuffer } from './pdfParseServer';

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[… text zkrácen na ${maxChars.toLocaleString('cs-CZ')} znaků …]`;
}

export async function parseMethodologyBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<{ fileType: UploadedMethodology['fileType']; content: string }> {
  const ext = getExtension(fileName);

  if (ext === '.txt') {
    return {
      fileType: 'txt',
      content: truncateContent(buffer.toString('utf-8').trim(), MAX_METHODOLOGY_CHARS),
    };
  }

  if (ext === '.md') {
    return {
      fileType: 'md',
      content: truncateContent(buffer.toString('utf-8').trim(), MAX_METHODOLOGY_CHARS),
    };
  }

  if (ext === '.pdf') {
    const raw = await parsePdfBuffer(buffer);
    if (!raw) {
      throw new Error('PDF neobsahuje extrahovatelný text (možná naskenovaný dokument).');
    }
    return {
      fileType: 'pdf',
      content: truncateContent(raw, MAX_METHODOLOGY_CHARS),
    };
  }

  throw new Error('Nepodporovaný formát. Povolené: .pdf, .txt, .md');
}

export function isSupportedMethodologyFileName(fileName: string): boolean {
  const ext = getExtension(fileName);
  return ext === '.pdf' || ext === '.txt' || ext === '.md';
}
