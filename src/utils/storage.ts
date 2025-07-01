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

// Auto-save functionality for unsaved drafts
export function saveLastDraft(draft: Draft): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('longform_lastDraft', JSON.stringify(draft));
}

export function getLastDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  const lastDraft = localStorage.getItem('longform_lastDraft');
  return lastDraft ? JSON.parse(lastDraft) : null;
}

export function clearLastDraft(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('longform_lastDraft');
}

export function hasUnsavedDraft(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('longform_lastDraft') !== null;
} 