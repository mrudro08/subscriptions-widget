// Amounts are stored as integers in hundredths of the base currency.

export const CURRENCIES = ["USD", "EUR", "GBP", "BDT", "INR", "CAD", "AUD", "SGD", "AED", "JPY", "CHF", "SEK", "NZD", "MYR", "PKR"];

const cache = new Map<string, Intl.NumberFormat>();
function fmt(currency: string, digits: number): Intl.NumberFormat {
  const key = `${currency}:${digits}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    cache.set(key, f);
  }
  return f;
}

function fractionDigits(currency: string): number {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** "$15.49" */
export function money(cents: number, currency: string): string {
  return fmt(currency, fractionDigits(currency)).format(cents / 100);
}

/** "$1,073" — whole units, for the yearly estimate. */
export function moneyWhole(cents: number, currency: string): string {
  return fmt(currency, 0).format(Math.round(cents / 100));
}

/** The symbol shown in the amount field, e.g. "$" or "৳". */
export function currencySymbol(currency: string): string {
  const part = fmt(currency, 0).formatToParts(0).find((p) => p.type === "currency");
  return part?.value ?? currency;
}

/** Parses user input like "10", "10.5", "1,299.00" → cents. Returns null when invalid. */
export function parseAmount(input: string): number | null {
  const clean = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const cents = Math.round(parseFloat(clean) * 100);
  return cents > 0 && cents < 100_000_000 ? cents : null;
}

export function amountInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
