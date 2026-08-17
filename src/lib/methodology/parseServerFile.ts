import { MAX_METHODOLOGY_CHARS } from '@/lib/readMethodologyFile';
import type { UploadedMethodology } from '@/types/settings';

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
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      const raw = textResult.text?.trim() ?? '';
      if (!raw) {
        throw new Error('PDF neobsahuje extrahovatelný text (možná naskenovaný dokument).');
      }
      return {
        fileType: 'pdf',
        content: truncateContent(raw, MAX_METHODOLOGY_CHARS),
      };
    } finally {
      await parser.destroy();
    }
  }

  throw new Error('Nepodporovaný formát. Povolené: .pdf, .txt, .md');
}

export function isSupportedMethodologyFileName(fileName: string): boolean {
  const ext = getExtension(fileName);
  return ext === '.pdf' || ext === '.txt' || ext === '.md';
}
