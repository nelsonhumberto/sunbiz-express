'use client';

import { createContext, useContext } from 'react';

const WizardStepAnalyticsContext = createContext<{ filingId: string; step: number } | null>(null);

export function WizardStepAnalyticsProvider({
  filingId,
  step,
  children,
}: {
  filingId: string;
  step: number;
  children: React.ReactNode;
}) {
  return (
    <WizardStepAnalyticsContext.Provider value={{ filingId, step }}>
      {children}
    </WizardStepAnalyticsContext.Provider>
  );
}

export function useWizardStepAnalytics() {
  return useContext(WizardStepAnalyticsContext);
}
