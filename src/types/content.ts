export interface AuthorProfile {
  name?: string;
  displayName?: string;
  nip05?: string;
  image?: string;
  picture?: string;
}

export interface EmojiTag {
  shortcode: string;
  url: string;
}

export interface BlogPost {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  title: string;
  summary: string;
  published_at: number;
  image?: string;
  tags: string[];
  author?: AuthorProfile;
  dTag?: string;
  emojiTags?: EmojiTag[];
  client?: string;
}

export interface LongformDraft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
  sources?: Array<'local' | 'nostr'>;
  dTag?: string;
  originalTags?: string[][];
  coverImage?: string;
  summary?: string;
  hashtags?: string[];
  kind?: number;
}

export interface PublishedNote {
  id: string;
  pubkey: string;
  title: string;
  content: string;
  publishedAt: string;
  summary?: string;
  dTag?: string;
  createdAt: string;
}
