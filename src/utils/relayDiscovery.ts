import NDK, { NDKRelaySet, getRelayListForUser } from '@nostr-dev-kit/ndk';

const RELAY_LIST_TIMEOUT_MS = 3000;

/**
 * Resolves an author's NIP-65 write relays and returns a relay set that's the
 * union of those with whatever's currently connected — additive only, so a
 * missing/slow/stale NIP-65 list can only help a fetch, never regress it.
 * Returns undefined on timeout/error/no-list, meaning "fetch as usual".
 */
export async function getAuthorRelaySet(
  ndk: NDK,
  authorPubkey: string
): Promise<NDKRelaySet | undefined> {
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NIP-65 relay list lookup timed out')), RELAY_LIST_TIMEOUT_MS);
    });

    const relayList = await Promise.race([getRelayListForUser(authorPubkey, ndk), timeout]);
    const writeRelays = relayList.writeRelayUrls;
    if (writeRelays.length === 0) return undefined;

    const connectedRelays = ndk.pool.connectedRelays().map((r) => r.url);
    const merged = [...new Set([...writeRelays, ...connectedRelays])];
    return NDKRelaySet.fromRelayUrls(merged, ndk);
  } catch {
    return undefined;
  }
}
