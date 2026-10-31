/**
 * Initial registered-agent toggle.
 * A saved true/false choice is kept. Our agent is the default only when
 * the customer has not saved an agent yet. The "no in-state address"
 * choice must not overwrite that saved choice.
 */
export function initialUseOurRegisteredAgent(
  savedUseOurService: boolean | null | undefined,
): boolean {
  if (savedUseOurService === true || savedUseOurService === false) return savedUseOurService;
  return true;
}

/**
 * Properties added to `wizard_step_completed` on the principal-address step.
 * Florida filings use `no_florida_address`. Other formation states use
 * `no_in_state_address` so the Florida property is not mislabeled.
 */
export function addressStepCompletedProperties(
  filingState: string,
  noFloridaAddress: boolean,
): { no_florida_address: boolean } | { no_in_state_address: boolean } {
  if (filingState === 'FL') return { no_florida_address: noFloridaAddress };
  return { no_in_state_address: noFloridaAddress };
}
