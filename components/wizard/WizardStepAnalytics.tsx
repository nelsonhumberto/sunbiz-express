'use client';

import { createContext, useContext } from 'react';

const WizardStepAnalyticsContext = createContext<{
  filingId: string;
  step: number;
  preselected?: boolean;
} | null>(null);

export function WizardStepAnalyticsProvider({
  filingId,
  step,
  preselected,
  children,
}: {
  filingId: string;
  step: number;
  preselected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <WizardStepAnalyticsContext.Provider value={{ filingId, step, preselected }}>
      {children}
    </WizardStepAnalyticsContext.Provider>
  );
}

export function useWizardStepAnalytics() {
  return useContext(WizardStepAnalyticsContext);
}
