/** Format unix seconds for display */
export function formatUnixDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatExpirationDate(isoOrDate: string): string {
  const date = new Date(isoOrDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function isExpiringSoon(expiresAt: string): boolean {
  const expirationDate = new Date(expiresAt);
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return expirationDate <= sevenDaysFromNow;
}
