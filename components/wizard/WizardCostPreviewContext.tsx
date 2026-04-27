'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TierSlug } from '@/lib/pricing';

type Ctx = {
  /** Live tier while on step 3 (drives order summary). Null = use server cost data. */
  tierPreview: TierSlug | null;
  setTierPreview: (t: TierSlug) => void;
};

const WizardCostPreviewContext = createContext<Ctx | null>(null);

export function WizardCostPreviewProvider({
  children,
  step,
  serverTier,
}: {
  children: ReactNode;
  step: number;
  serverTier: TierSlug;
}) {
  const [tierPreview, setTierState] = useState<TierSlug | null>(null);

  // When entering tier step, seed the preview from the filing so the sidebar
  // matches before any click. When leaving, drop preview so other steps use DB.
  useEffect(() => {
    if (step === 3) {
      setTierState(serverTier);
    } else {
      setTierState(null);
    }
  }, [step, serverTier]);

  const setTierPreview = useCallback((t: TierSlug) => {
    setTierState(t);
  }, []);

  const value = useMemo(
    () => ({ tierPreview, setTierPreview }),
    [tierPreview, setTierPreview],
  );

  return (
    <WizardCostPreviewContext.Provider value={value}>
      {children}
    </WizardCostPreviewContext.Provider>
  );
}

export function useWizardCostPreview() {
  const ctx = useContext(WizardCostPreviewContext);
  if (!ctx) {
    throw new Error('useWizardCostPreview must be used within WizardCostPreviewProvider');
  }
  return ctx;
}
