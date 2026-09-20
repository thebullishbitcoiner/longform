import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_EMOJI_LIST, emojiSetCoordinate } from '@/nostr/kinds';
import { Nip07Signer } from '@/utils/nip07Signer';
import { fetchEventsBounded } from '@/utils/ndkFetch';
import { fetchEmojiSets } from '@/nostr/emojiSets';
import type { EmojiEntry, EmojiList, EmojiSetRef } from '@/types/emoji';

function toNostrEvent(event: NDKEvent): NostrEvent | null {
  if (!event.sig) return null;
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at!,
    kind: event.kind!,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  };
}

function pickLatest(events: NDKEvent[]): NDKEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at! - a.created_at!)[0];
}

function isValidEntry(e: { name?: unknown; url?: unknown }): e is EmojiEntry {
  return typeof e.name === 'string' && typeof e.url === 'string' && !!e.name.trim() && !!e.url.trim();
}

function parseSetRefTag(tag: string[]): EmojiSetRef | null {
  // `a` tag value: "30030:<pubkey>:<dTag>"
  const [kind, pubkey, dTag] = (tag[1] || '').split(':');
  if (kind !== '30030' || !pubkey || !dTag) return null;
  return { pubkey, dTag };
}

/** NIP-51 kind 10030 "Emojis" — one per author, no `d` tag needed. */
async function fetchLatestEmojiListEvent(ndk: NDK, pubkey: string): Promise<NDKEvent | null> {
  const res = await fetchEventsBounded(ndk, {
    kinds: [KIND_EMOJI_LIST],
    authors: [pubkey],
    limit: 1,
  });
  return pickLatest([...res]);
}

/**
 * Per NIP-51, list items can live in plaintext tags, in a NIP-44
 * self-encrypted `content` (a JSON-stringified tags array), or both —
 * clients are free to keep the whole list private. Returns `[]` when
 * `content` is empty, isn't decryptable (no signer available, or it
 * simply isn't NIP-44 ciphertext), or doesn't parse as a tags array.
 */
async function decryptEmojiListTags(ndk: NDK, event: NDKEvent): Promise<string[][]> {
  if (!event.content) return [];
  const signer = ndk.signer;
  if (!(signer instanceof Nip07Signer)) {
    console.warn('[customEmojis] kind-10030 has encrypted content but no Nip07Signer is attached to decrypt it');
    return [];
  }
  try {
    const plain = await signer.decryptNip44(event.content);
    const tags = JSON.parse(plain);
    if (!Array.isArray(tags)) {
      console.warn('[customEmojis] decrypted kind-10030 content is not a tags array:', plain.slice(0, 200));
      return [];
    }
    return tags.filter((t): t is string[] => Array.isArray(t));
  } catch (error) {
    console.error('[customEmojis] failed to decrypt kind-10030 content:', error);
    return [];
  }
}

function extractEmojiList(tags: string[][]): EmojiList {
  const setRefs: EmojiSetRef[] = [];
  const looseEmojis: EmojiEntry[] = [];
  const seenSets = new Set<string>();
  const seenEmojis = new Set<string>();

  for (const tag of tags) {
    if (tag[0] === 'a') {
      const ref = parseSetRefTag(tag);
      if (!ref) continue;
      const key = `${ref.pubkey}:${ref.dTag}`;
      if (seenSets.has(key)) continue;
      seenSets.add(key);
      setRefs.push(ref);
    } else if (tag[0] === 'emoji' && isValidEntry({ name: tag[1], url: tag[2] })) {
      if (seenEmojis.has(tag[1])) continue;
      seenEmojis.add(tag[1]);
      looseEmojis.push({ name: tag[1], url: tag[2] });
    }
  }

  return { setRefs, looseEmojis };
}

/**
 * Loads the user's NIP-51 kind-10030 emoji list (set subscriptions + loose
 * emojis), merging whatever's in plaintext tags with whatever's in a
 * NIP-44-encrypted `content` — some clients (e.g. Circl) publish the whole
 * list privately, with only non-emoji tags (like `client`) left public.
 */
export async function loadCustomEmojiList(ndk: NDK, pubkey: string): Promise<EmojiList> {
  const event = await fetchLatestEmojiListEvent(ndk, pubkey);
  if (!event || event.pubkey !== pubkey) return { setRefs: [], looseEmojis: [] };

  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) return { setRefs: [], looseEmojis: [] };

  const privateTags = await decryptEmojiListTags(ndk, event);
  return extractEmojiList([...event.tags, ...privateTags]);
}

/** Publishes the list fully NIP-44 self-encrypted, keeping it private like other clients already do. */
export async function publishCustomEmojiList(ndk: NDK, list: EmojiList): Promise<void> {
  const signer = ndk.signer;
  if (!(signer instanceof Nip07Signer)) {
    throw new Error('A NIP-07 signer is required to publish an emoji list');
  }

  const setRefs = list.setRefs;
  const looseEmojis = list.looseEmojis.filter(isValidEntry);
  const tags = [
    ...setRefs.map((r) => ['a', emojiSetCoordinate(r.pubkey, r.dTag)]),
    ...looseEmojis.map((e) => ['emoji', e.name, e.url]),
  ];

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_EMOJI_LIST;
  ndkEvent.content = await signer.encryptNip44(JSON.stringify(tags));
  ndkEvent.tags = [];
  ndkEvent.created_at = Math.floor(Date.now() / 1000);
  await ndkEvent.publish();
}

/**
 * Resolves an emoji list into the flat, ready-to-render array a reaction
 * picker actually wants: every subscribed set's emojis, plus the loose
 * ones, deduped by shortcode (loose entries win on conflict).
 */
export async function resolveCustomEmojis(ndk: NDK, list: EmojiList): Promise<EmojiEntry[]> {
  const sets = await fetchEmojiSets(ndk, list.setRefs);
  const merged = new Map<string, EmojiEntry>();
  for (const set of sets) {
    for (const emoji of set.emojis) merged.set(emoji.name, emoji);
  }
  for (const emoji of list.looseEmojis) merged.set(emoji.name, emoji);
  return [...merged.values()];
}
