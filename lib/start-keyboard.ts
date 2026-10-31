/** Pixels of visible space kept under Continue when the mobile keyboard is open. */
export const CONTINUE_SCROLL_MARGIN_PX = 16;

/**
 * How far to scroll so the button bottom sits `margin` px above the visible
 * bottom. Zero when it is already inside that box.
 */
export function continueButtonScrollDelta(input: {
  buttonBottom: number;
  visibleHeight: number;
  margin?: number;
}): number {
  const margin = input.margin ?? CONTINUE_SCROLL_MARGIN_PX;
  return Math.max(0, input.buttonBottom - (input.visibleHeight - margin));
}
