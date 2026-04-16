import type { NDKEvent } from '@nostr-dev-kit/ndk';

export interface ZapData {
  id: string;
  pubkey: string;
  amount: number;
  content?: string;
  created_at: number;
  authorName?: string;
  authorPicture?: string;
  /** Human-readable comment from the embedded zap request (NIP-57), when present. */
  zapMessage?: string;
  event?: NDKEvent;
}

/** Top zaps shown in the article header (ranked by amount). */
export interface TopZapBadge {
  id: string;
  pubkey: string;
  amount: number;
  authorName?: string;
  authorPicture?: string;
  /** Parsed zap-request comment; only set for the #1 badge in the header. */
  zapMessage?: string;
}

export interface ReactionData {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  authorName?: string;
  authorPicture?: string;
  event: NDKEvent;
}

export interface RepostData {
  id: string;
  pubkey: string;
  created_at: number;
  authorName?: string;
  authorPicture?: string;
  kind: number;
  event: NDKEvent;
}
