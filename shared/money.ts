const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdExact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats integer cents as whole US dollars, e.g. 85000 -> "$850". */
export function formatUsd(cents: number): string {
  return usdWhole.format(Math.round(cents) / 100);
}

/** Formats integer cents with cents shown, e.g. 85025 -> "$850.25". */
export function formatUsdExact(cents: number): string {
  return usdExact.format(Math.round(cents) / 100);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
