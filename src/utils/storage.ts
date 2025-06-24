export interface Draft {
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
  kind?: number; // 30024 for drafts, 30023 for published posts
}

export function getDrafts(): Draft[] {
  if (typeof window === 'undefined') return [];
  const drafts = localStorage.getItem('drafts');
  return drafts ? JSON.parse(drafts) : [];
}

export function getDraft(id: string): Draft | null {
  const drafts = getDrafts();
  return drafts.find(draft => draft.id === id) || null;
}

export function updateDraft(updatedDraft: Draft): void {
  const drafts = getDrafts();
  const index = drafts.findIndex(draft => draft.id === updatedDraft.id);
  if (index !== -1) {
    drafts[index] = updatedDraft;
    localStorage.setItem('drafts', JSON.stringify(drafts));
  }
}

export function deleteDraft(id: string): void {
  const drafts = getDrafts();
  const updatedDrafts = drafts.filter(draft => draft.id !== id);
  localStorage.setItem('drafts', JSON.stringify(updatedDrafts));
} 