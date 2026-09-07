import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, type Event, type EventTemplate } from 'nostr-tools';
import { KIND_APP_SPECIFIC_DATA } from '@/nostr/kinds';
import type { PlatformKeys } from './keys';

/** Fetches the latest event per d-tag, in one relay round trip. */
export async function fetchPlatformDocuments(
  relays: string[],
  platformPubkey: string,
  dTags: string[]
): Promise<Map<string, Event>> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(relays, {
      kinds: [KIND_APP_SPECIFIC_DATA],
      authors: [platformPubkey],
      '#d': dTags,
      limit: 100,
    });
    const latestByDTag = new Map<string, Event>();
    for (const ev of events) {
      const d = ev.tags.find((t) => t[0] === 'd')?.[1];
      if (!d) continue;
      const existing = latestByDTag.get(d);
      if (!existing || ev.created_at > existing.created_at) {
        latestByDTag.set(d, ev);
      }
    }
    return latestByDTag;
  } finally {
    pool.close(relays);
  }
}

/** Publishes one already-encrypted document under one d-tag. */
export async function publishPlatformDocument(
  relays: string[],
  keys: PlatformKeys,
  dTag: string,
  content: string
): Promise<Event> {
  const unsigned: EventTemplate = {
    kind: KIND_APP_SPECIFIC_DATA,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', dTag]],
    content,
  };
  const signed = finalizeEvent(unsigned, keys.secretKey);
  const pool = new SimplePool();
  try {
    const results = await Promise.allSettled(pool.publish(relays, signed));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === 0) {
      console.warn('[platform-roster] publish: no relay accepted event', dTag, relays.join(', '));
    }
    return signed;
  } finally {
    pool.close(relays);
  }
}
