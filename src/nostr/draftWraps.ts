import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_DRAFT_WRAP, KIND_LONGFORM_DRAFT } from '@/nostr/kinds';
import type { Nip07Signer } from '@/utils/nip07Signer';
import { DEFAULT_RELAYS } from '@/config/relays';
import { ensurePreferredRelays, loadPreferredRelays } from './preferredRelays';
import { fetchEventsBounded } from '@/utils/ndkFetch';

/** Refreshed on every save, per NIP-40's recommended usage in NIP-37. */
const DRAFT_EXPIRATION_SEC = 90 * 24 * 60 * 60;

export type UnsignedDraftEvent = {
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
};

export type ListedDraft = UnsignedDraftEvent & { id: string; wrapCreatedAt: number };

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

async function relaySetFor(ndk: NDK, urls: string[]) {
  const { NDKRelaySet } = await import('@nostr-dev-kit/ndk');
  const targets = urls.length > 0 ? urls : DEFAULT_RELAYS;
  return NDKRelaySet.fromRelayUrls(targets, ndk);
}

/** Returns null for a deleted (blanked-content) or undecryptable/invalid wrap. */
async function decryptWrap(
  signer: Nip07Signer,
  event: NDKEvent,
  authorPubkey: string
): Promise<UnsignedDraftEvent | null> {
  if (event.pubkey !== authorPubkey) return null;
  const raw = toNostrEvent(event);
  if (!raw || !verifyEvent(raw)) return null;
  if (!event.content) return null;
  try {
    const plain = await signer.decryptNip44(event.content);
    const parsed = JSON.parse(plain) as UnsignedDraftEvent;
    if (
      typeof parsed.kind !== 'number' ||
      !Array.isArray(parsed.tags) ||
      typeof parsed.content !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function loadDraft(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string,
  id: string
): Promise<UnsignedDraftEvent | null> {
  const storageRelays = await loadPreferredRelays(ndk, signer, pubkey);
  const relaySet = await relaySetFor(ndk, storageRelays);
  const events = await fetchEventsBounded(
    ndk,
    { kinds: [KIND_DRAFT_WRAP], authors: [pubkey], '#d': [id], limit: 1 },
    undefined,
    relaySet
  );
  const event = [...events][0];
  if (!event) return null;
  return decryptWrap(signer, event, pubkey);
}

export async function listDrafts(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string
): Promise<ListedDraft[]> {
  const storageRelays = await loadPreferredRelays(ndk, signer, pubkey);
  const relaySet = await relaySetFor(ndk, storageRelays);
  const events = await fetchEventsBounded(
    ndk,
    { kinds: [KIND_DRAFT_WRAP], authors: [pubkey] },
    undefined,
    relaySet
  );

  const results: ListedDraft[] = [];
  for (const event of events) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1];
    const kindTag = event.tags.find((t) => t[0] === 'k')?.[1];
    if (!dTag || kindTag !== String(KIND_LONGFORM_DRAFT)) continue;
    const draft = await decryptWrap(signer, event, pubkey);
    if (!draft) continue;
    results.push({ ...draft, id: dTag, wrapCreatedAt: event.created_at ?? draft.created_at });
  }
  return results;
}

export async function saveDraft(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string,
  id: string,
  draft: UnsignedDraftEvent
): Promise<void> {
  const storageRelays = await ensurePreferredRelays(ndk, signer, pubkey);
  const content = await signer.encryptNip44(JSON.stringify(draft));

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_DRAFT_WRAP;
  ndkEvent.content = content;
  ndkEvent.created_at = Math.floor(Date.now() / 1000);
  ndkEvent.tags = [
    ['d', id],
    ['k', String(draft.kind)],
    ['expiration', String(Math.floor(Date.now() / 1000) + DRAFT_EXPIRATION_SEC)],
  ];

  const relaySet = await relaySetFor(ndk, storageRelays);
  await ndkEvent.publish(relaySet);
}

/** Blanks the wrap's content — per spec, this is how a draft wrap signals deletion. */
export async function deleteDraft(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string,
  id: string
): Promise<void> {
  const storageRelays = await loadPreferredRelays(ndk, signer, pubkey);
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_DRAFT_WRAP;
  ndkEvent.content = '';
  ndkEvent.created_at = Math.floor(Date.now() / 1000);
  ndkEvent.tags = [
    ['d', id],
    ['k', String(KIND_LONGFORM_DRAFT)],
  ];
  const relaySet = await relaySetFor(ndk, storageRelays);
  await ndkEvent.publish(relaySet);
}
