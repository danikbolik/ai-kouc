import { randomUUID } from 'crypto';

import { formatStorageError, formatSupabaseError, isMissingTableError } from '@/lib/supabase/errors';
import { getSupabaseAdmin, isCloudDbConfigured } from '@/lib/supabase/server';
import type { UploadedMethodology } from '@/types/settings';

export const METHODOLOGY_BUCKET = 'methodology_docs';

export interface MethodologyDocumentRow {
  id: string;
  user_id: string;
  file_name: string;
  file_type: 'pdf' | 'txt' | 'md';
  storage_path: string | null;
  content: string;
  char_count: number;
  uploaded_at: string;
}

function rowToUploadedMethodology(row: MethodologyDocumentRow): UploadedMethodology {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    uploadedAt: row.uploaded_at,
    content: row.content,
    charCount: row.char_count,
  };
}

function buildStoragePath(userId: string, docId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/${docId}/${safeName}`;
}

export async function listMethodologyDocuments(userId: string): Promise<UploadedMethodology[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('methodology_documents')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: true });

  if (error) {
    if (isMissingTableError(error, 'methodology_documents')) {
      throw new Error(
        'Tabulka methodology_documents neexistuje. V Supabase SQL Editoru spusť supabase/migrations/004_methodology_documents.sql',
      );
    }
    throw new Error(formatSupabaseError('listMethodologyDocuments SELECT failed', error, { userId }));
  }

  return (data as MethodologyDocumentRow[]).map(rowToUploadedMethodology);
}

export async function uploadMethodologyDocument(
  userId: string,
  fileName: string,
  fileType: UploadedMethodology['fileType'],
  content: string,
  fileBuffer?: Buffer | null,
): Promise<UploadedMethodology & { storageWarning?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Cloud databáze není nakonfigurována.');
  }

  const docId = randomUUID();
  const storagePath = buildStoragePath(userId, docId, fileName);
  const uploadedAt = new Date().toISOString();
  let finalStoragePath: string | null = null;
  let storageWarning: string | undefined;

  if (fileBuffer && fileBuffer.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(METHODOLOGY_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType:
          fileType === 'pdf'
            ? 'application/pdf'
            : fileType === 'md'
              ? 'text/markdown'
              : 'text/plain',
        upsert: false,
      });

    if (storageError) {
      storageWarning = formatStorageError('Storage upload skipped', storageError, {
        userId,
        storagePath,
        hint: 'V Supabase vytvoř bucket methodology_docs nebo spusť migraci 004_methodology_documents.sql',
      });
      console.warn('[uploadMethodologyDocument]', storageWarning);
    } else {
      finalStoragePath = storagePath;
    }
  }

  const row: MethodologyDocumentRow = {
    id: docId,
    user_id: userId,
    file_name: fileName,
    file_type: fileType,
    storage_path: finalStoragePath,
    content,
    char_count: content.length,
    uploaded_at: uploadedAt,
  };

  const { data, error } = await supabase
    .from('methodology_documents')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    if (finalStoragePath) {
      await supabase.storage.from(METHODOLOGY_BUCKET).remove([finalStoragePath]);
    }
    if (isMissingTableError(error, 'methodology_documents')) {
      throw new Error(
        'Tabulka methodology_documents neexistuje. V Supabase SQL Editoru spusť soubor supabase/migrations/004_methodology_documents.sql',
      );
    }
    throw new Error(formatSupabaseError('methodology_documents INSERT failed', error, { userId }));
  }

  const document = rowToUploadedMethodology(data as MethodologyDocumentRow);
  return storageWarning ? { ...document, storageWarning } : document;
}

export async function deleteMethodologyDocument(
  userId: string,
  docId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { data: existing, error: fetchError } = await supabase
    .from('methodology_documents')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('id', docId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(formatSupabaseError('deleteMethodologyDocument SELECT failed', fetchError, {
      userId,
      docId,
    }));
  }

  if (!existing) return false;

  const { error: deleteError } = await supabase
    .from('methodology_documents')
    .delete()
    .eq('user_id', userId)
    .eq('id', docId);

  if (deleteError) {
    throw new Error(formatSupabaseError('deleteMethodologyDocument DELETE failed', deleteError, {
      userId,
      docId,
    }));
  }

  if (existing.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(METHODOLOGY_BUCKET)
      .remove([existing.storage_path as string]);

    if (storageError) {
      console.warn('[deleteMethodologyDocument] Storage remove failed', storageError);
    }
  }

  return true;
}

export async function insertLegacyMethodologyDocument(
  userId: string,
  doc: UploadedMethodology,
): Promise<UploadedMethodology> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Cloud DB not configured');

  const row: MethodologyDocumentRow = {
    id: doc.id.includes('-') ? doc.id : randomUUID(),
    user_id: userId,
    file_name: doc.fileName,
    file_type: doc.fileType,
    storage_path: null,
    content: doc.content,
    char_count: doc.charCount,
    uploaded_at: doc.uploadedAt,
  };

  const { data, error } = await supabase
    .from('methodology_documents')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw new Error(formatSupabaseError('insertLegacyMethodologyDocument failed', error, { userId }));
  }

  return rowToUploadedMethodology(data as MethodologyDocumentRow);
}

export async function migrateLegacyMethodologyFromUserData(userId: string): Promise<number> {
  const existing = await listMethodologyDocuments(userId);
  if (existing.length > 0) return 0;

  const { getUserData } = await import('@/lib/userData/repository');
  const userData = await getUserData(userId);
  const legacy = userData?.uploadedMethodology ?? [];
  if (!legacy.length) return 0;

  let migrated = 0;
  for (const doc of legacy) {
    try {
      await insertLegacyMethodologyDocument(userId, doc);
      migrated += 1;
    } catch (error) {
      console.warn('[migrateLegacyMethodology]', { userId, docId: doc.id, error });
    }
  }
  return migrated;
}

export { isCloudDbConfigured };
