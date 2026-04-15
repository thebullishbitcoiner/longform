/**
 * Canonical Nostr event kinds used by Longform.
 * Cross-check with https://github.com/nostr-protocol/nips/blob/master/README.md
 */

/** NIP-01 metadata */
export const KIND_METADATA = 0;

/** NIP-01 text note */
export const KIND_TEXT_NOTE = 1;

/** NIP-02 contact list */
export const KIND_CONTACT_LIST = 3;

/** NIP-04 encrypted direct message */
export const KIND_ENCRYPTED_DM = 4;

/** NIP-09 deletion request */
export const KIND_DELETION = 5;

/** NIP-18 repost */
export const KIND_REPOST = 6;

/** NIP-25 reaction */
export const KIND_REACTION = 7;

/** NIP-18 generic repost */
export const KIND_GENERIC_REPOST = 16;

/** Application-specific subscriber list */
export const KIND_SUBSCRIBERS_LIST = 30000;

/** NIP-23 longform article */
export const KIND_LONGFORM_ARTICLE = 30023;

/** Longform draft (replaceable; client pairing with NIP-23) */
export const KIND_LONGFORM_DRAFT = 30024;

/** NIP-65 relay list */
export const KIND_RELAY_LIST = 10002;

/** NIP-37 preferred relays */
export const KIND_PREFERRED_RELAYS = 10013;

/** NIP-84 highlight */
export const KIND_HIGHLIGHT = 9802;

/** NIP-57 zap request */
export const KIND_ZAP_REQUEST = 9734;

/** NIP-57 zap receipt */
export const KIND_ZAP = 9735;

/** NIP-22 comment */
export const KIND_NIP22_COMMENT = 1111;

/** Repost kinds (standard + generic) */
export const KINDS_REPOST = [KIND_REPOST, KIND_GENERIC_REPOST] as const;

/**
 * `a` tag coordinate for a longform article: `30023:<pubkey>:<d-tag>`
 */
export function longformArticleCoordinate(pubkey: string, dTag: string): string {
  return `${KIND_LONGFORM_ARTICLE}:${pubkey}:${dTag}`;
}
