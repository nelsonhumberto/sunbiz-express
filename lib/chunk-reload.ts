export const CHUNK_RELOAD_FLAG = 'lf_chunk_reload';

const CHUNK_MESSAGES = [
  'loading chunk',
  'loading css chunk',
  'failed to load chunk',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  if (name === 'ChunkLoadError') return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const lower = message.toLowerCase();
  return CHUNK_MESSAGES.some((needle) => lower.includes(needle));
}

/** Capture-phase script errors for Next's own static chunks. */
export function isNextStaticScript(src: string | null | undefined): boolean {
  if (!src) return false;
  const path = src.split('?')[0] ?? src;
  return path.includes('/_next/static/') && path.endsWith('.js');
}

type FlagStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/**
 * One reload per failure. A storage exception does not reload, so a
 * private-mode throw cannot loop.
 */
export function chunkReloadDecision(storage: FlagStorage | null): 'reload' | 'skip' {
  if (!storage) return 'skip';
  try {
    if (storage.getItem(CHUNK_RELOAD_FLAG) === '1') return 'skip';
    storage.setItem(CHUNK_RELOAD_FLAG, '1');
    return 'reload';
  } catch {
    return 'skip';
  }
}
