import type { EmojiSetRef } from '@/types/emoji';

/**
 * Featured NIP-51 kind-30030 emoji sets, pinned at the top of the emoji-set
 * browser in Settings. Resolved live from relays (see `src/nostr/emojiSets.ts`)
 * rather than stored locally — if one of these can no longer be found on
 * relays, it simply won't render, rather than falling back to stale data.
 */
export const FEATURED_EMOJI_SETS: EmojiSetRef[] = [
  { pubkey: 'd7607464225c8ab610da99495bc70c8a3a45a03f8a22a95f06fcb5bc421e573a', dTag: 'Reacts' },
  { pubkey: 'cd408a69cc6c737ca1a76efc3fa247c6ca53ec807f6e7c9574164164797e8162', dTag: 'Nostopus' },
  { pubkey: 'cd408a69cc6c737ca1a76efc3fa247c6ca53ec807f6e7c9574164164797e8162', dTag: 'SUSHIYUKI' },
];
