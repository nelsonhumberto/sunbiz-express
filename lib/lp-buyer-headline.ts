/** Buyer headline for the Florida LLC ad landing. Price is the formatted Essential total. */
export function floridaLlcBuyerHeadline(locale: 'en' | 'es', price: string): string {
  if (locale === 'es') return `Abre tu LLC en Florida en línea, ${price} todo incluido`;
  return `Form your Florida LLC online, ${price} all in`;
}
