export type CustomEmoji = {
  name: string;
  url: string;
};

export type EmojiFromSet = {
  name: string;
  url: string;
};

export type EmojiSet = {
  id: string;
  pubkey: string;
  title: string;
  dTag: string;
  creator: string;
  created_at: number;
  emojis: EmojiFromSet[];
};
