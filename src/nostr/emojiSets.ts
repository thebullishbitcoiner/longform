import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19, verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_EMOJI_SET } from '@/nostr/kinds';
import { npubToHex } from '@/utils/nostr';
import { fetchEventsBounded } from '@/utils/ndkFetch';
import type { EmojiEntry, EmojiSet, EmojiSetRef } from '@/types/emoji';

/** Relays known to carry NIP-51 emoji-set content, for the best-effort Discover view. */
const DISCOVERY_RELAYS = ['wss://nos.lol'];

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

function isValidEmojiEntry(e: { name?: unknown; url?: unknown }): e is EmojiEntry {
  return typeof e.name === 'string' && typeof e.url === 'string' && !!e.name.trim() && !!e.url.trim();
}

function pickLatest(events: NDKEvent[]): NDKEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at! - a.created_at!)[0];
}

function parseEmojiSetEvent(event: NDKEvent): EmojiSet | null {
  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) return null;

  const dTag = event.tags.find((t) => t[0] === 'd')?.[1];
  if (!dTag) return null;

  const title = event.tags.find((t) => t[0] === 'title')?.[1] || dTag;
  const emojis = event.tags
    .filter((t) => t[0] === 'emoji' && t[1] && t[2])
    .map((t) => ({ name: t[1], url: t[2] }))
    .filter(isValidEmojiEntry);

  return {
    pubkey: event.pubkey,
    dTag,
    title,
    eventId: event.id,
    createdAt: event.created_at ?? 0,
    emojis,
  };
}

/** Fetches one author's NIP-51 kind-30030 emoji set by its `d` tag. Returns null if not found. */
export async function fetchEmojiSet(ndk: NDK, pubkey: string, dTag: string): Promise<EmojiSet | null> {
  const res = await fetchEventsBounded(ndk, {
    kinds: [KIND_EMOJI_SET],
    authors: [pubkey],
    '#d': [dTag],
    limit: 1,
  });
  const event = pickLatest([...res].filter((e) => e.pubkey === pubkey));
  if (!event) return null;
  return parseEmojiSetEvent(event);
}

/**
 * Resolves several emoji-set references at once, grouping by author so each
 * author is queried only once. Refs that can't be found on relays are simply
 * dropped from the result — this app never fabricates a set that isn't real.
 */
export async function fetchEmojiSets(ndk: NDK, refs: EmojiSetRef[]): Promise<EmojiSet[]> {
  const dTagsByPubkey = new Map<string, Set<string>>();
  for (const ref of refs) {
    const set = dTagsByPubkey.get(ref.pubkey) ?? new Set<string>();
    set.add(ref.dTag);
    dTagsByPubkey.set(ref.pubkey, set);
  }

  const results = await Promise.all(
    [...dTagsByPubkey.entries()].map(async ([pubkey, dTags]) => {
      const res = await fetchEventsBounded(ndk, {
        kinds: [KIND_EMOJI_SET],
        authors: [pubkey],
        '#d': [...dTags],
      });

      const latestByDTag = new Map<string, NDKEvent>();
      for (const event of res) {
        if (event.pubkey !== pubkey) continue;
        const dTag = event.tags.find((t) => t[0] === 'd')?.[1];
        if (!dTag || !dTags.has(dTag)) continue;
        const existing = latestByDTag.get(dTag);
        if (!existing || event.created_at! > existing.created_at!) {
          latestByDTag.set(dTag, event);
        }
      }

      return [...latestByDTag.values()]
        .map(parseEmojiSetEvent)
        .filter((s): s is EmojiSet => s !== null);
    })
  );

  return results.flat();
}

/**
 * Best-effort browse of whatever NIP-51 emoji sets the discovery relays
 * happen to be carrying. Not a complete index — Nostr relays don't offer
 * full-text search over arbitrary tags, so this is a light "what's out
 * there" list, not a guarantee of finding every set in existence.
 */
export async function discoverEmojiSets(ndk: NDK): Promise<EmojiSet[]> {
  const { NDKRelaySet } = await import('@nostr-dev-kit/ndk');
  const relaySet = NDKRelaySet.fromRelayUrls(DISCOVERY_RELAYS, ndk);

  const res = await fetchEventsBounded(
    ndk,
    { kinds: [KIND_EMOJI_SET], limit: 200 },
    undefined,
    relaySet
  );

  const latestByCoordinate = new Map<string, NDKEvent>();
  for (const event of res) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1];
    if (!dTag) continue;
    const coordinate = `${event.pubkey}:${dTag}`;
    const existing = latestByCoordinate.get(coordinate);
    if (!existing || event.created_at! > existing.created_at!) {
      latestByCoordinate.set(coordinate, event);
    }
  }

  return [...latestByCoordinate.values()]
    .map(parseEmojiSetEvent)
    .filter((s): s is EmojiSet => s !== null);
}

/**
 * Decodes a user-supplied reference to an emoji set: either an `naddr1...`
 * string, or an npub/hex pubkey paired with a manually-typed `d` tag.
 */
export function decodeEmojiSetReference(input: string, dTag?: string): EmojiSetRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('naddr1')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== 'naddr') return null;
      if (decoded.data.kind !== KIND_EMOJI_SET) return null;
      return { pubkey: decoded.data.pubkey, dTag: decoded.data.identifier };
    } catch {
      return null;
    }
  }

  if (!dTag?.trim()) return null;

  if (trimmed.startsWith('npub1')) {
    const hex = npubToHex(trimmed);
    return hex ? { pubkey: hex, dTag: dTag.trim() } : null;
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { pubkey: trimmed.toLowerCase(), dTag: dTag.trim() };
  }

  return null;
}
