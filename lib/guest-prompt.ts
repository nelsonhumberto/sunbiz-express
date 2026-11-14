/** Package choice is wizard URL step 3. The save-progress popup must not cover it. */
export const GUEST_PROMPT_PACKAGE_STEP = 3;

/** Same wait for organic and ad traffic. The landing path never mounts this prompt. */
export const GUEST_PROMPT_DELAY_MS = 45_000;

export function guestPromptDelayMs(): number {
  return GUEST_PROMPT_DELAY_MS;
}

export function shouldShowGuestAccountPrompt(input: {
  isGuest: boolean;
  lpShort: boolean;
  hasEmail: boolean;
  step: number;
}): boolean {
  if (!input.isGuest || input.lpShort || !input.hasEmail) return false;
  if (input.step < 2 || input.step === GUEST_PROMPT_PACKAGE_STEP) return false;
  return true;
}
