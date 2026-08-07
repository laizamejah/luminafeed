/** Platform commission taken from every marketplace sale. */
export const PLATFORM_FEE_BPS = 500; // 5.00%

export function splitAmount(amountCents: number) {
  const platform_fee_cents = Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000);
  return {
    amount_cents: amountCents,
    platform_fee_cents,
    seller_net_cents: amountCents - platform_fee_cents,
  };
}

export function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
