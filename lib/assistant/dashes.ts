/** Em dash becomes a comma. En dash becomes a hyphen. */
export function stripAssistantDashes(text: string): string {
  return text.replaceAll('\u2014', ',').replaceAll('\u2013', '-');
}

export function stripAssistantDashPart<T extends { type: string; text?: string }>(part: T): T {
  if (
    (part.type === 'text-delta' || part.type === 'reasoning-delta') &&
    typeof part.text === 'string' &&
    (part.text.includes('\u2014') || part.text.includes('\u2013'))
  ) {
    return { ...part, text: stripAssistantDashes(part.text) };
  }
  return part;
}
