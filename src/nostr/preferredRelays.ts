import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent, NDKKind, getRelayListForUser } from '@nostr-dev-kit/ndk';
import { KIND_PREFERRED_RELAYS } from '@/nostr/kinds';
import type { Nip07Signer } from '@/utils/nip07Signer';
import { DEFAULT_RELAYS } from '@/config/relays';

function pickLatest(events: NDKEvent[]): NDKEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.created_at - a.created_at)[0];
}

async function fetchPreferredRelaysEvent(ndk: NDK, pubkey: string): Promise<NDKEvent | null> {
  const res = await ndk.fetchEvents({
    kinds: [KIND_PREFERRED_RELAYS as NDKKind],
    authors: [pubkey],
    limit: 1,
  });
  return pickLatest([...res]);
}

/** NIP-37 kind 10013: "the user's preferred relays to store private events like Draft Wraps". */
export async function loadPreferredRelays(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string
): Promise<string[]> {
  const event = await fetchPreferredRelaysEvent(ndk, pubkey);
  if (!event || event.pubkey !== pubkey) return [];

  try {
    const plain = await signer.decryptNip44(event.content);
    const tags = JSON.parse(plain) as string[][];
    if (!Array.isArray(tags)) return [];
    return tags.filter((t) => t[0] === 'relay' && t[1]).map((t) => t[1]);
  } catch {
    return [];
  }
}

/** Per spec: MUST be published to the author's NIP-65 write relays. */
export async function publishPreferredRelays(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string,
  relayUrls: string[]
): Promise<void> {
  const content = await signer.encryptNip44(
    JSON.stringify(relayUrls.map((url) => ['relay', url]))
  );
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = KIND_PREFERRED_RELAYS;
  ndkEvent.content = content;
  ndkEvent.tags = [];
  ndkEvent.created_at = Math.floor(Date.now() / 1000);

  let writeRelays: string[] = [];
  try {
    const relayList = await getRelayListForUser(pubkey, ndk);
    writeRelays = relayList.writeRelayUrls;
  } catch {
    // fall through to default relays below
  }

  const publishTargets = writeRelays.length > 0 ? writeRelays : DEFAULT_RELAYS;
  const { NDKRelaySet } = await import('@nostr-dev-kit/ndk');
  await ndkEvent.publish(NDKRelaySet.fromRelayUrls(publishTargets, ndk));
}

/**
 * Returns the user's current preferred (draft-storage) relays, auto-provisioning
 * them (defaulted to their NIP-65 write relays) the first time this is called.
 */
export async function ensurePreferredRelays(
  ndk: NDK,
  signer: Nip07Signer,
  pubkey: string
): Promise<string[]> {
  const existing = await loadPreferredRelays(ndk, signer, pubkey);
  if (existing.length > 0) return existing;

  let defaults: string[] = DEFAULT_RELAYS;
  try {
    const relayList = await getRelayListForUser(pubkey, ndk);
    if (relayList.writeRelayUrls.length > 0) defaults = relayList.writeRelayUrls;
  } catch {
    // use DEFAULT_RELAYS
  }

  await publishPreferredRelays(ndk, signer, pubkey, defaults);
  return defaults;
}
