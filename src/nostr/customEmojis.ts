import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_EMOJI_LIST, emojiSetCoordinate } from '@/nostr/kinds';
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

/** NIP-51 kind 10030 "Emojis" — plaintext, one per author, no `d` tag needed. */
async function fetchLatestEmojiListEvent(ndk: NDK, pubkey: string): Promise<NDKEvent | null> {
  const res = await fetchEventsBounded(ndk, {
    kinds: [KIND_EMOJI_LIST],
    authors: [pubkey],
    limit: 1,
  });
  return pickLatest([...res]);
}

function parseEmojiListEvent(event: NDKEvent, authorPubkey: string): EmojiList {
  if (event.pubkey !== authorPubkey) return { setRefs: [], looseEmojis: [] };
  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) return { setRefs: [], looseEmojis: [] };

  const setRefs = event.tags
    .filter((t) => t[0] === 'a')
    .map(parseSetRefTag)
    .filter((r): r is EmojiSetRef => r !== null);

  const looseEmojis = event.tags
    .filter((t) => t[0] === 'emoji' && t[1] && t[2])
    .map((t) => ({ name: t[1], url: t[2] }))
    .filter(isValidEntry);

  return { setRefs, looseEmojis };
}

/** Loads the user's NIP-51 kind-10030 emoji list (set subscriptions + loose emojis). */
export async function loadCustomEmojiList(ndk: NDK, pubkey: string): Promise<EmojiList> {
  const event = await fetchLatestEmojiListEvent(ndk, pubkey);
  if (!event) return { setRefs: [], looseEmojis: [] };
  return parseEmojiListEvent(event, pubkey);
}

export async function publishCustomEmojiList(ndk: NDK, list: EmojiList): Promise<void> {
  const setRefs = list.setRefs;
  const looseEmojis = list.looseEmojis.filter(isValidEntry);

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_EMOJI_LIST;
  ndkEvent.content = '';
  ndkEvent.tags = [
    ...setRefs.map((r) => ['a', emojiSetCoordinate(r.pubkey, r.dTag)]),
    ...looseEmojis.map((e) => ['emoji', e.name, e.url]),
  ];
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
