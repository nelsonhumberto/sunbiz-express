'use client';

import { useState } from 'react';

export function OaTemplateResend({
  token,
  label,
  pendingLabel,
  success,
  error,
}: {
  token: string;
  label: string;
  pendingLabel: string;
  success: string;
  error: string;
}) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'failed'>('idle');

  async function onClick() {
    if (state === 'pending' || state === 'done') return;
    setState('pending');
    try {
      const response = await fetch('/api/leads/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setState(response.ok ? 'done' : 'failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onClick}
        disabled={state === 'pending' || state === 'done'}
        className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {state === 'pending' ? pendingLabel : label}
      </button>
      {state === 'done' ? <p className="mt-3 text-sm text-ink">{success}</p> : null}
      {state === 'failed' ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
