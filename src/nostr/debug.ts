/**
 * Verbose client diagnostics for Nostr-related flows (NDK, relays, editor, reader).
 * Set NEXT_PUBLIC_DEBUG_NOSTR=true in .env.local to enable.
 */
export function isNostrDebug(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_NOSTR === 'true';
}

export function nostrDebug(...args: unknown[]): void {
  if (isNostrDebug()) {
    console.log('[nostr]', ...args);
  }
}
