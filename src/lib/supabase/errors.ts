import type { PostgrestError } from '@supabase/supabase-js';

export function formatSupabaseError(
  context: string,
  error: PostgrestError | Error | unknown,
  extra?: Record<string, unknown>,
): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const pg = error as PostgrestError;
    const parts = [
      context,
      pg.message,
      pg.code ? `code=${pg.code}` : null,
      pg.details ? `details=${pg.details}` : null,
      pg.hint ? `hint=${pg.hint}` : null,
    ].filter(Boolean);
    console.error(`[Supabase] ${parts.join(' | ')}`, { ...extra, error: pg });
    return parts.join(' | ');
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Supabase] ${context} | ${message}`, extra);
  return `${context} | ${message}`;
}

export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false;
  const message = String((error as PostgrestError).message ?? '').toLowerCase();
  return (
    message.includes(column.toLowerCase()) &&
    (message.includes('does not exist') ||
      message.includes('column') ||
      message.includes('42703'))
  );
}
