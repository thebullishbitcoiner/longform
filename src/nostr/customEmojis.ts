import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_SPECIFIC_DATA, KIND_EMOJI_LIST } from '@/nostr/kinds';
import { Nip07Signer } from '@/utils/nip07Signer';
import { fetchEventsBounded } from '@/utils/ndkFetch';

/** Legacy (pre-NIP-51) storage location — read-only, for one-time forward migration. */
const LEGACY_CUSTOM_EMOJIS_D_TAG = 'longform-emojis';

export type CustomEmojiEntry = { name: string; url: string };

type LegacyCustomEmojisPayload = {
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

function pickLatest(events: NDKEvent[]): NDKEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at - a.created_at)[0];
}

function isValidEntry(e: { name?: unknown; url?: unknown }): e is CustomEmojiEntry {
  return typeof e.name === 'string' && typeof e.url === 'string' && !!e.name.trim() && !!e.url.trim();
}

/** NIP-51 kind 10030 "Emojis" — plaintext, one per author, no `d` tag needed. */
async function fetchLatestEmojiListEvent(ndk: NDK, pubkey: string): Promise<NDKEvent | null> {
  const res = await fetchEventsBounded(ndk, {
    kinds: [KIND_EMOJI_LIST],
    authors: [pubkey],
    limit: 1,
  });
  return pickLatest([...res]);
}

function parseEmojiListEvent(event: NDKEvent, authorPubkey: string): CustomEmojiEntry[] {
  if (event.pubkey !== authorPubkey) return [];
  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) return [];
  return event.tags
    .filter((t) => t[0] === 'emoji' && t[1] && t[2])
    .map((t) => ({ name: t[1], url: t[2] }))
    .filter(isValidEntry);
}

async function fetchLegacyCustomEmojisEvent(ndk: NDK, pubkey: string): Promise<NDKEvent | null> {
  const res = await fetchEventsBounded(ndk, {
    kinds: [KIND_APP_SPECIFIC_DATA],
    authors: [pubkey],
    '#d': [LEGACY_CUSTOM_EMOJIS_D_TAG],
    limit: 100,
  });
  return pickLatest([...res]);
}

async function loadLegacyCustomEmojis(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string
): Promise<CustomEmojiEntry[]> {
  const event = await fetchLegacyCustomEmojisEvent(ndk, pubkey);
  if (!event || event.pubkey !== pubkey) return [];
  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) return [];
  try {
    const plain = await signer.decryptNip44(event.content);
    const parsed = JSON.parse(plain) as LegacyCustomEmojisPayload;
    if (parsed.v !== 1 || !Array.isArray(parsed.emojis)) return [];
    return parsed.emojis.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * Loads the user's custom emoji list (NIP-51 kind 10030). If none exists yet,
 * checks for a legacy pre-NIP-51 encrypted list and migrates it forward once.
 */
export async function loadCustomEmojis(ndk: NDK, pubkey: string): Promise<CustomEmojiEntry[]> {
  const event = await fetchLatestEmojiListEvent(ndk, pubkey);
  if (event) {
    return parseEmojiListEvent(event, pubkey);
  }

  const signer = ndk.signer;
  if (signer instanceof Nip07Signer) {
    try {
      const legacyEmojis = await loadLegacyCustomEmojis(ndk, signer, pubkey);
      if (legacyEmojis.length > 0) {
        await publishCustomEmojis(ndk, legacyEmojis);
        return legacyEmojis;
      }
    } catch (error) {
      console.error('Error migrating legacy custom emojis:', error);
    }
  }

  return [];
}

export async function publishCustomEmojis(ndk: NDK, emojis: CustomEmojiEntry[]): Promise<void> {
  const list = emojis.filter(isValidEntry);
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_EMOJI_LIST;
  ndkEvent.content = '';
  ndkEvent.tags = list.map((e) => ['emoji', e.name, e.url]);
  ndkEvent.created_at = Math.floor(Date.now() / 1000);
  await ndkEvent.publish();
}
