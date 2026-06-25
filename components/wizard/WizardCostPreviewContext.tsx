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
  /** Live add-on selection while on the add-ons step. Null = use server cost data. */
  addOnsPreview: string[] | null;
  setAddOnsPreview: (slugs: string[] | null) => void;
};

const WizardCostPreviewContext = createContext<Ctx | null>(null);

// Route step for the add-ons screen (Step11AddOns renders here).
const ADD_ONS_STEP = 10;

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
  const [addOnsPreview, setAddOnsState] = useState<string[] | null>(null);

  // When entering tier step, seed the preview from the filing so the sidebar
  // matches before any click. When leaving, drop preview so other steps use DB.
  // Same idea for the add-ons step: only let the live selection drive the
  // sidebar while on that step.
  useEffect(() => {
    setTierState(step === 3 ? serverTier : null);
    if (step !== ADD_ONS_STEP) setAddOnsState(null);
  }, [step, serverTier]);

  const setTierPreview = useCallback((t: TierSlug) => {
    setTierState(t);
  }, []);

  const setAddOnsPreview = useCallback((slugs: string[] | null) => {
    setAddOnsState(slugs);
  }, []);

  const value = useMemo(
    () => ({ tierPreview, setTierPreview, addOnsPreview, setAddOnsPreview }),
    [tierPreview, setTierPreview, addOnsPreview, setAddOnsPreview],
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
