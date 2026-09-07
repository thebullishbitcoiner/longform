import type { MeStatusApiResponse, MeStatusResponse } from '@/types/platformStatus';
import type { ProStatus } from '@/types/platformBilling';

/** Avoid hammering /api/status/me (relays are slow; many components mount useProStatus). */
const CACHE_TTL_MS = 60_000;

export type PlatformMeFetchResult =
  | { kind: 'ok'; data: MeStatusResponse }
  | { kind: 'disabled' }
  | { kind: 'error' };

type CacheEntry = { at: number; result: PlatformMeFetchResult };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PlatformMeFetchResult>>();

function isActiveStatus(data: MeStatusApiResponse): data is MeStatusResponse {
  return data.configured === true;
}

async function fetchPlatformMeNetwork(pubkeyHex: string): Promise<PlatformMeFetchResult> {
  try {
    const r = await fetch(`/api/status/me?pubkey=${encodeURIComponent(pubkeyHex)}`, {
      cache: 'no-store',
    });
    if (!r.ok) return { kind: 'error' };
    const data = (await r.json()) as MeStatusApiResponse;
    if (!isActiveStatus(data)) return { kind: 'disabled' };
    return { kind: 'ok', data };
  } catch {
    return { kind: 'error' };
  }
}

export function invalidatePlatformMeCache(pubkeyHex?: string): void {
  if (pubkeyHex) {
    const key = pubkeyHex.toLowerCase();
    cache.delete(key);
    inflight.delete(key);
  } else {
    cache.clear();
    inflight.clear();
  }
}

export async function fetchPlatformMe(pubkeyHex: string): Promise<PlatformMeFetchResult> {
  const key = pubkeyHex.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.result;
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchPlatformMeNetwork(key).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, pending);
  }

  const result = await pending;
  cache.set(key, { at: Date.now(), result });
  return result;
}

export function platformMeToProStatus(m: MeStatusResponse): ProStatus {
  const isSubPro = m.isProSubscriptionActive || m.isInRenewalGraceWindow;
  return {
    isPro: isSubPro,
    expiresAt: m.proEndsAt != null ? new Date(m.proEndsAt * 1000).toISOString() : undefined,
    isInBuffer: m.isInRenewalGraceWindow,
  };
}
