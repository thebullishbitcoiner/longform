import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKFilter, NDKRelay, NDKRelaySet, NDKSubscriptionOptions } from '@nostr-dev-kit/ndk';

/**
 * Default bound for one-shot relay queries. An unresponsive relay that never
 * sends EOSE must never be able to hang the caller indefinitely — every
 * fetchEvents/fetchEvent call in this app should go through these wrappers
 * rather than calling ndk.fetchEvents/fetchEvent directly.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 15000;

export async function fetchEventsBounded(
  ndk: NDK,
  filters: NDKFilter | NDKFilter[],
  opts?: NDKSubscriptionOptions,
  relaySet?: NDKRelaySet,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Set<NDKEvent>> {
  try {
    return await Promise.race([
      ndk.fetchEvents(filters, opts, relaySet),
      new Promise<Set<NDKEvent>>((resolve) => {
        setTimeout(() => resolve(new Set()), timeoutMs);
      }),
    ]);
  } catch {
    return new Set();
  }
}

export async function fetchEventBounded(
  ndk: NDK,
  idOrFilter: string | NDKFilter | NDKFilter[],
  opts?: NDKSubscriptionOptions,
  relaySetOrRelay?: NDKRelaySet | NDKRelay,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<NDKEvent | null> {
  try {
    return await Promise.race([
      ndk.fetchEvent(idOrFilter, opts, relaySetOrRelay),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  }
}
