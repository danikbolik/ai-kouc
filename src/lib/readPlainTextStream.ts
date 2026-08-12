/** Přečte plain-text HTTP response body po chunkách (pro AI SDK toTextStreamResponse). */
export async function readPlainTextStream(
  response: Response,
  onPartial?: (accumulated: string) => void,
): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;

    accumulated += chunk;
    onPartial?.(accumulated);
  }

  const trailing = decoder.decode();
  if (trailing) {
    accumulated += trailing;
    onPartial?.(accumulated);
  }

  return accumulated;
}
