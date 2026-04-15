import type { NDKEvent } from '@nostr-dev-kit/ndk';

export interface ZapData {
  id: string;
  pubkey: string;
  amount: number;
  content?: string;
  created_at: number;
  authorName?: string;
  event?: NDKEvent;
}

export interface ReactionData {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  authorName?: string;
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
