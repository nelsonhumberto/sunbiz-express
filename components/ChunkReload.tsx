'use client';

import { useEffect } from 'react';
import {
  CHUNK_RELOAD_FLAG,
  chunkReloadDecision,
  isChunkLoadError,
  isNextStaticScript,
} from '@/lib/chunk-reload';

/** One full reload when a deploy invalidates the open session's chunks. */
export function ChunkReload() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
      } catch {
        // Storage can throw. Leaving the flag set only blocks a later reload.
      }
    }, 15_000);

    const reloadOnce = () => {
      if (chunkReloadDecision(sessionStorage) !== 'reload') return;
      window.location.reload();
    };

    const onError = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement && isNextStaticScript(target.src)) {
        reloadOnce();
        return;
      }
      if (!(event instanceof ErrorEvent)) return;
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) reloadOnce();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) reloadOnce();
    };

    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
