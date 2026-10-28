/**
 * One signal that aborts when any input aborts. A single live signal is
 * returned as-is so its abort reason stays intact.
 */
export function linkAbortSignals(
  signals: Array<AbortSignal | undefined | null>,
): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];

  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  for (const signal of present) {
    if (signal.aborted) {
      abort();
      return controller.signal;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}
