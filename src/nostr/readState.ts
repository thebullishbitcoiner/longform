import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_SPECIFIC_DATA } from '@/nostr/kinds';
import type { Nip07Signer } from '@/utils/nip07Signer';

/** NIP-78 `d` tag for replaceable read-state document */
export const READ_STATE_D_TAG = 'longform';

export type ReadStatePlaintext = { readIDs: string[] };

const HEX64 = /^[0-9a-f]{64}$/i;

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

export function serializeReadStatePayload(readIds: Set<string>): string {
  const list = [...readIds].filter((id) => HEX64.test(id));
  list.sort();
  return JSON.stringify({ readIDs: list } satisfies ReadStatePlaintext);
}

export function pickLatestReadStateEvent(events: NDKEvent[]): NDKEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at - a.created_at)[0];
}

export async function fetchLatestReadStateEvent(ndk: NDK, pubkey: string): Promise<NDKEvent | null> {
  const res = await ndk.fetchEvents({
    kinds: [KIND_APP_SPECIFIC_DATA],
    authors: [pubkey],
    '#d': [READ_STATE_D_TAG],
    limit: 100,
  });
  return pickLatestReadStateEvent([...res]);
}

export async function decryptReadStateFromEvent(
  signer: Nip07Signer,
  event: NDKEvent,
  authorPubkey: string
): Promise<Set<string>> {
  if (event.pubkey !== authorPubkey) return new Set();
  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[readState] dropped event with invalid signature', event.id);
    }
    return new Set();
  }
  try {
    const plain = await signer.decryptNip44(event.content);
    const parsed = JSON.parse(plain) as ReadStatePlaintext;
    const ids = parsed.readIDs;
    if (!Array.isArray(ids)) return new Set();
    const out = new Set<string>();
    for (const id of ids) {
      if (typeof id === 'string' && HEX64.test(id)) out.add(id);
    }
    return out;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[readState] decrypt/parse failed', e);
    }
    return new Set();
  }
}

export async function publishReadState(ndk: NDK, signer: Nip07Signer, readIds: Set<string>): Promise<void> {
  const content = await signer.encryptNip44(serializeReadStatePayload(readIds));
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_APP_SPECIFIC_DATA;
  ndkEvent.content = content;
  ndkEvent.tags = [['d', READ_STATE_D_TAG]];
  ndkEvent.created_at = Math.floor(Date.now() / 1000);
  await ndkEvent.publish();
}
