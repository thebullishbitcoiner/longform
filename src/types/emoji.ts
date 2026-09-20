/** One emoji: a shortcode paired with an image URL. */
export type EmojiEntry = {
  name: string;
  url: string;
};

/** A reference to a NIP-51 kind-30030 emoji set, as parsed from an `a` tag. */
export type EmojiSetRef = {
  pubkey: string;
  dTag: string;
};

/** A resolved NIP-51 kind-30030 "emoji set" event. */
export type EmojiSet = {
  pubkey: string;
  dTag: string;
  /** The `title` tag if present, otherwise falls back to `dTag`. */
  title: string;
  eventId: string;
  createdAt: number;
  emojis: EmojiEntry[];
};

/**
 * A user's NIP-51 kind-10030 "Emojis" list: a mix of subscriptions to other
 * authors' kind-30030 sets (via `a` tags) and one-off individual emojis
 * (via direct `emoji` tags).
 */
export type EmojiList = {
  setRefs: EmojiSetRef[];
  looseEmojis: EmojiEntry[];
};
