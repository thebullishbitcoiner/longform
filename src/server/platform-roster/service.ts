import { verifyEvent, type Event } from 'nostr-tools';
import { DEFAULT_RELAYS } from '@/config/relays';
import type { PlatformLegendRosterV1, PlatformProRosterV1 } from '@/types/platformRoster';
import { emptyLegendRoster, emptyProRoster } from '@/types/platformRoster';
import type { PlatformKeys } from './keys';
import {
  ALL_PLATFORM_D_TAGS,
  PLATFORM_LEGEND_D_TAG,
  dTagForProTier,
  type PlatformProTier,
} from './constants';
import {
  decryptLegendRosterContent,
  decryptProRosterContent,
  encryptLegendRosterJson,
  encryptProRosterJson,
} from './crypto';
import {
  mergeLegendRosterWithLastWritten,
  mergeProRosterWithLastWritten,
  setLastWrittenLegendRoster,
  setLastWrittenProRoster,
} from './cache';
import { fetchPlatformDocuments, publishPlatformDocument } from './relay';
import type { PlatformRosterBundle } from '@/types/platformRoster';

function relayUrls(): string[] {
  const extra = process.env.PLATFORM_RELAY_URLS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  return [...new Set([...DEFAULT_RELAYS, ...extra])];
}

function verifyPlatformEvent(keys: PlatformKeys, ev: Event): void {
  if (!verifyEvent(ev)) {
    throw new Error('Platform roster event has invalid signature');
  }
  if (ev.pubkey.toLowerCase() !== keys.publicKey.toLowerCase()) {
    throw new Error('Platform roster event author mismatch');
  }
}

function decodeProEventOrEmpty(keys: PlatformKeys, ev: Event | null): PlatformProRosterV1 {
  if (!ev) return emptyProRoster();
  verifyPlatformEvent(keys, ev);
  return decryptProRosterContent(keys, ev.content);
}

function decodeLegendEventOrEmpty(keys: PlatformKeys, ev: Event | null): PlatformLegendRosterV1 {
  if (!ev) return emptyLegendRoster();
  verifyPlatformEvent(keys, ev);
  return decryptLegendRosterContent(keys, ev.content);
}

/** One relay round trip for all three documents — used for status resolution. */
export async function loadDecryptedRosterBundle(keys: PlatformKeys): Promise<PlatformRosterBundle> {
  const byDTag = await fetchPlatformDocuments(relayUrls(), keys.publicKey, [...ALL_PLATFORM_D_TAGS]);

  const monthlyTag = dTagForProTier('monthly');
  const yearlyTag = dTagForProTier('yearly');

  const monthly = mergeProRosterWithLastWritten(
    'monthly',
    decodeProEventOrEmpty(keys, byDTag.get(monthlyTag) ?? null)
  );
  const yearly = mergeProRosterWithLastWritten(
    'yearly',
    decodeProEventOrEmpty(keys, byDTag.get(yearlyTag) ?? null)
  );
  const legend = mergeLegendRosterWithLastWritten(
    decodeLegendEventOrEmpty(keys, byDTag.get(PLATFORM_LEGEND_D_TAG) ?? null)
  );

  return { monthly, yearly, legend };
}

/** Tier-scoped load/publish — grants only ever touch the one relevant document. */
export async function loadDecryptedProRoster(
  keys: PlatformKeys,
  tier: PlatformProTier
): Promise<PlatformProRosterV1> {
  const dTag = dTagForProTier(tier);
  const byDTag = await fetchPlatformDocuments(relayUrls(), keys.publicKey, [dTag]);
  return mergeProRosterWithLastWritten(tier, decodeProEventOrEmpty(keys, byDTag.get(dTag) ?? null));
}

export async function publishMergedProRoster(
  keys: PlatformKeys,
  tier: PlatformProTier,
  roster: PlatformProRosterV1
): Promise<Event> {
  const content = encryptProRosterJson(keys, roster);
  const signed = await publishPlatformDocument(relayUrls(), keys, dTagForProTier(tier), content);
  setLastWrittenProRoster(tier, roster);
  return signed;
}

export async function loadDecryptedLegendRoster(keys: PlatformKeys): Promise<PlatformLegendRosterV1> {
  const byDTag = await fetchPlatformDocuments(relayUrls(), keys.publicKey, [PLATFORM_LEGEND_D_TAG]);
  return mergeLegendRosterWithLastWritten(
    decodeLegendEventOrEmpty(keys, byDTag.get(PLATFORM_LEGEND_D_TAG) ?? null)
  );
}

export async function publishMergedLegendRoster(
  keys: PlatformKeys,
  roster: PlatformLegendRosterV1
): Promise<Event> {
  const content = encryptLegendRosterJson(keys, roster);
  const signed = await publishPlatformDocument(relayUrls(), keys, PLATFORM_LEGEND_D_TAG, content);
  setLastWrittenLegendRoster(roster);
  return signed;
}

export { relayUrls };
