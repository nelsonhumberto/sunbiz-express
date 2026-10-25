/** Greeting line. A missing name has no trailing comma. */
export function greetingText(part: string | null, name: string): string {
  const trimmed = name.trim();
  if (!part) return trimmed;
  if (!trimmed) return part;
  return `${part}, ${trimmed}`;
}
