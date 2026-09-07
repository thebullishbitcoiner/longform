import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_SPECIFIC_DATA } from '@/nostr/kinds';

export const PROFILE_DATA_D_TAG = 'longform-profile';

export type ProfileDataPayload = {
  v: 1;
  background?: string;
};

function toNostrEvent(event: NDKEvent): NostrEvent | null {
  if (!event.sig) return null;
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind!,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  };
}

function pickLatest(events: NDKEvent[]): NDKEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at - a.created_at)[0];
}

function parseProfileDataContent(content: string): ProfileDataPayload | null {
  try {
    const parsed = JSON.parse(content) as ProfileDataPayload;
    if (parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchLatestProfileDataEvent(
  ndk: NDK,
  authorPubkey: string
): Promise<NDKEvent | null> {
  const res = await ndk.fetchEvents({
    kinds: [KIND_APP_SPECIFIC_DATA],
    authors: [authorPubkey],
    '#d': [PROFILE_DATA_D_TAG],
    limit: 100,
  });
  return pickLatest([...res]);
}

/** Profile background is public (plaintext JSON) so any visitor can render it. */
export async function loadProfileBackground(
  ndk: NDK,
  authorPubkey: string
): Promise<string | null> {
  const ev = await fetchLatestProfileDataEvent(ndk, authorPubkey);
  if (!ev) return null;
  const raw = toNostrEvent(ev);
  if (!raw || !verifyEvent(raw)) return null;
  const data = parseProfileDataContent(ev.content);
  const bg = data?.background?.trim();
  return bg || null;
}
