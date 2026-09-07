import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_SPECIFIC_DATA } from '@/nostr/kinds';
import type { Nip07Signer } from '@/utils/nip07Signer';

export const CUSTOM_EMOJIS_D_TAG = 'longform-emojis';

export type CustomEmojiEntry = { name: string; url: string };

export type CustomEmojisPayload = {
  v: 1;
  emojis: CustomEmojiEntry[];
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

export function serializeCustomEmojisPayload(emojis: CustomEmojiEntry[]): string {
  const list = emojis.filter((e) => e.name?.trim() && e.url?.trim());
  return JSON.stringify({ v: 1, emojis: list } satisfies CustomEmojisPayload);
}

function pickLatest(events: NDKEvent[]): NDKEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at - a.created_at)[0];
}

export async function fetchLatestCustomEmojisEvent(
  ndk: NDK,
  pubkey: string
): Promise<NDKEvent | null> {
  const res = await ndk.fetchEvents({
    kinds: [KIND_APP_SPECIFIC_DATA],
    authors: [pubkey],
    '#d': [CUSTOM_EMOJIS_D_TAG],
    limit: 100,
  });
  return pickLatest([...res]);
}

export async function decryptCustomEmojisFromEvent(
  signer: Nip07Signer,
  event: NDKEvent,
  authorPubkey: string
): Promise<CustomEmojiEntry[]> {
  if (event.pubkey !== authorPubkey) return [];
  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) return [];
  try {
    const plain = await signer.decryptNip44(event.content);
    const parsed = JSON.parse(plain) as CustomEmojisPayload;
    if (parsed.v !== 1 || !Array.isArray(parsed.emojis)) return [];
    return parsed.emojis.filter(
      (e) => typeof e.name === 'string' && typeof e.url === 'string' && e.name.trim() && e.url.trim()
    );
  } catch {
    return [];
  }
}

export async function loadCustomEmojis(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string
): Promise<CustomEmojiEntry[]> {
  const ev = await fetchLatestCustomEmojisEvent(ndk, pubkey);
  if (!ev) return [];
  return decryptCustomEmojisFromEvent(signer, ev, pubkey);
}

export async function publishCustomEmojis(
  ndk: NDK,
  signer: Nip07Signer,
  emojis: CustomEmojiEntry[]
): Promise<void> {
  const content = await signer.encryptNip44(serializeCustomEmojisPayload(emojis));
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_APP_SPECIFIC_DATA;
  ndkEvent.content = content;
  ndkEvent.tags = [['d', CUSTOM_EMOJIS_D_TAG]];
  ndkEvent.created_at = Math.floor(Date.now() / 1000);
  await ndkEvent.publish();
}
