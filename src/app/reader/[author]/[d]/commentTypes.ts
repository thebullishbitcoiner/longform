import type { NDKEvent } from '@nostr-dev-kit/ndk';

export interface CommentData {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  authorName?: string;
  authorPicture?: string;
  kind: number;
  event: NDKEvent;
  parentId?: string;
  children: CommentData[];
  depth: number;
}

export const countTotalComments = (comments: CommentData[]): number => {
  let count = 0;
  comments.forEach((comment) => {
    count += 1;
    count += countTotalComments(comment.children);
  });
  return count;
};

export const findCommentById = (comments: CommentData[], id: string): CommentData | null => {
  for (const comment of comments) {
    if (comment.id === id) return comment;
    const found = findCommentById(comment.children, id);
    if (found) return found;
  }
  return null;
};
