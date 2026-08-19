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

export function isMissingTableError(error: unknown, table: string): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false;
  const pg = error as PostgrestError;
  const message = String(pg.message ?? '').toLowerCase();
  const tableLower = table.toLowerCase();
  return (
    pg.code === '42P01' ||
    (message.includes(tableLower) && message.includes('does not exist'))
  );
}

export function formatStorageError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const storageError = error as { message?: string; error?: string; statusCode?: string };
    const parts = [
      context,
      storageError.message ?? storageError.error,
      storageError.statusCode ? `status=${storageError.statusCode}` : null,
    ].filter(Boolean);
    console.error(`[Supabase Storage] ${parts.join(' | ')}`, { ...extra, error: storageError });
    return parts.join(' | ');
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Supabase Storage] ${context} | ${message}`, extra);
  return `${context} | ${message}`;
}

export function isUpsertConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const pg = error as PostgrestError;
  if (pg.code === '42P10') return true;
  const message = String(pg.message ?? '').toLowerCase();
  return message.includes('no unique or exclusion constraint') && message.includes('on conflict');
}
