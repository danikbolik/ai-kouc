/** Detekuje chybu validace schématu z Vercel AI SDK / Zod */
export function isLlmSchemaValidationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const name = (error as { name?: string }).name ?? '';
  if (
    name.includes('Validation') ||
    name.includes('TypeValidation') ||
    name.includes('NoObjectGenerated') ||
    name.includes('JSONParse')
  ) {
    return true;
  }

  if ('cause' in error) {
    const cause = (error as { cause: unknown }).cause;
    if (cause && typeof cause === 'object' && 'issues' in cause) {
      return true;
    }
  }

  return false;
}

/** Sestaví čitelnou chybovou hlášku z validační chyby LLM */
export function formatLlmValidationError(error: unknown): string {
  if (error && typeof error === 'object' && 'cause' in error) {
    const cause = (error as { cause: unknown }).cause;
    if (cause && typeof cause === 'object' && 'issues' in cause) {
      const issues = (cause as { issues: Array<{ path: (string | number)[]; message: string }> })
        .issues;
      const summary = issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
      return `LLM odpověď neodpovídá schématu recalculateResponseSchema. ${summary}`;
    }
  }

  if (error instanceof Error) {
    return `LLM odpověď neodpovídá schématu: ${error.message}`;
  }

  return 'LLM odpověď neodpovídá očekávanému JSON schématu.';
}
