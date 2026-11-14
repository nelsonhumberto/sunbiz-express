/** Pay stays disabled until Stripe has mounted the card field and the field is complete. */
export function cardFormSubmittable(input: {
  testerCheckout: boolean;
  elementReady: boolean;
  complete: boolean;
}): boolean {
  if (input.testerCheckout) return true;
  return input.elementReady && input.complete;
}
