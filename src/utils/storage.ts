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

// Storage quota management
const STORAGE_KEYS = {
  LAST_DRAFT: 'longform_lastDraft',
  MOBILE_ERRORS: 'longform_mobile-errors',
  POSTS: 'longform_posts',
  READ_POSTS: 'longform_readPosts',
  AUTHOR_PROFILES: 'longform_authorProfiles',
  USER_HIGHLIGHTS: 'longform_userHighlights',
  HIGHLIGHT_CACHE_TIMESTAMP: 'longform_highlightCacheTimestamp',
  RELAY_LIST_PREFIX: 'longform_relay_list_'
};

// Simple storage operations without testing
function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded, attempting cleanup...');
      cleanupStorage();
      
      // Try again after cleanup
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (retryError) {
        console.error('Failed to save after cleanup:', retryError);
        return false;
      }
    }
    console.error('Storage error:', error);
    return false;
  }
}

// Clean up storage to free space
function cleanupStorage(): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Remove old error logs first (they're least important)
    localStorage.removeItem(STORAGE_KEYS.MOBILE_ERRORS);
    
    // Remove old posts if we have too many
    const posts = localStorage.getItem(STORAGE_KEYS.POSTS);
    if (posts) {
      try {
        const postsArray = JSON.parse(posts);
        if (postsArray.length > 100) { // Keep only last 100 posts
          const trimmedPosts = postsArray.slice(-100);
          localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(trimmedPosts));
        }
      } catch {
        // If posts are corrupted, remove them
        localStorage.removeItem(STORAGE_KEYS.POSTS);
      }
    }
    
    // Remove old author profiles if we have too many
    const profiles = localStorage.getItem(STORAGE_KEYS.AUTHOR_PROFILES);
    if (profiles) {
      try {
        const profilesObj = JSON.parse(profiles);
        const profileKeys = Object.keys(profilesObj);
        if (profileKeys.length > 50) { // Keep only last 50 profiles
          const trimmedProfiles: Record<string, unknown> = {};
          profileKeys.slice(-50).forEach(key => {
            trimmedProfiles[key] = profilesObj[key];
          });
          localStorage.setItem(STORAGE_KEYS.AUTHOR_PROFILES, JSON.stringify(trimmedProfiles));
        }
      } catch {
        localStorage.removeItem(STORAGE_KEYS.AUTHOR_PROFILES);
      }
    }
    
    console.log('Storage cleanup completed');
  } catch (error) {
    console.error('Error during storage cleanup:', error);
  }
}

// Auto-save functionality for unsaved drafts
export function saveLastDraft(draft: Draft): void {
  if (typeof window === 'undefined') return;
  
  const success = safeSetItem(STORAGE_KEYS.LAST_DRAFT, JSON.stringify(draft));
  if (!success) {
    console.warn('Failed to save draft due to storage constraints');
  }
}

export function getLastDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const lastDraft = localStorage.getItem(STORAGE_KEYS.LAST_DRAFT);
    return lastDraft ? JSON.parse(lastDraft) : null;
  } catch (error) {
    console.error('Error reading draft from storage:', error);
    return null;
  }
}

export function clearLastDraft(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.LAST_DRAFT);
}

export function hasUnsavedDraft(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEYS.LAST_DRAFT) !== null;
}

// Highlight caching functions
export interface CachedHighlight {
  id: string;
  content: string;
  created_at: number;
  postId: string;
  postAuthor: string;
  postAuthorNip05?: string;
  postDTag?: string;
  startOffset?: number;
  endOffset?: number;
  eventTags: string[][];
  // Store the complete event data for JSON viewing
  eventData?: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
}

// Cache user highlights
export function cacheUserHighlights(pubkey: string, highlights: CachedHighlight[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const highlightsData = {
      pubkey,
      highlights,
      timestamp: Date.now()
    };
    
    const success = safeSetItem(STORAGE_KEYS.USER_HIGHLIGHTS, JSON.stringify(highlightsData));
    if (!success) {
      console.warn('Failed to cache highlights due to storage constraints');
    }
  } catch (error) {
    console.error('Error caching highlights:', error);
  }
}

// Get cached highlights for a user
export function getCachedHighlights(pubkey: string): CachedHighlight[] | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.USER_HIGHLIGHTS);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    
    // Check if cache is for the same user
    if (data.pubkey !== pubkey) return null;
    
    // Check if cache is fresh (less than 1 hour old)
    const cacheAge = Date.now() - data.timestamp;
    if (cacheAge > 60 * 60 * 1000) { // 1 hour
      console.log('Highlight cache expired, will refresh');
      return null;
    }
    
    return data.highlights || [];
  } catch (error) {
    console.error('Error reading cached highlights:', error);
    return null;
  }
}

// Add a new highlight to cache
export function addHighlightToCache(pubkey: string, highlight: CachedHighlight): void {
  if (typeof window === 'undefined') return;
  
  try {
    const existing = getCachedHighlights(pubkey) || [];
    
    // Check if highlight already exists
    const exists = existing.some(h => h.id === highlight.id);
    if (exists) return;
    
    // Add new highlight to the beginning (most recent first)
    const updated = [highlight, ...existing];
    
    cacheUserHighlights(pubkey, updated);
  } catch (error) {
    console.error('Error adding highlight to cache:', error);
  }
}

// Clear highlight cache
export function clearHighlightCache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.USER_HIGHLIGHTS);
  localStorage.removeItem(STORAGE_KEYS.HIGHLIGHT_CACHE_TIMESTAMP);
}

// Get highlights for a specific post
export function getHighlightsForPost(pubkey: string, postId: string): CachedHighlight[] {
  const highlights = getCachedHighlights(pubkey) || [];
  return highlights.filter(h => h.postId === postId);
}

// Export storage utilities for other components
export { safeSetItem, cleanupStorage, STORAGE_KEYS }; 