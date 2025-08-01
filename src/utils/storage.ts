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
  MOBILE_ERRORS: 'mobile-errors',
  POSTS: 'longform_posts',
  READ_POSTS: 'longform_readPosts',
  AUTHOR_PROFILES: 'longform_authorProfiles',
  RELAY_LIST_PREFIX: 'relay_list_'
};

// Check available storage space
function getAvailableStorage(): number {
  if (typeof window === 'undefined') return 0;
  
  try {
    const testKey = '__storage_test__';
    const testValue = 'x'.repeat(1024); // 1KB test
    let available = 0;
    
    // Test localStorage capacity
    for (let i = 0; i < 10000; i++) { // Test up to ~10MB
      try {
        localStorage.setItem(testKey + i, testValue);
        available += testValue.length;
      } catch (e) {
        break;
      }
    }
    
    // Clean up test data
    for (let i = 0; i < 10000; i++) {
      localStorage.removeItem(testKey + i);
    }
    
    return available;
      } catch {
      console.warn('Could not test storage capacity');
      return 0;
    }
}

// Safe localStorage operations with quota management
function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    // Check if we're about to exceed quota
    const currentSize = localStorage.getItem(key)?.length || 0;
    const newSize = value.length;
    const available = getAvailableStorage();
    
    // If we're adding significant data and storage is low, clean up
    if (newSize > currentSize && available < 1024 * 1024) { // Less than 1MB available
      cleanupStorage();
    }
    
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
      } catch (e) {
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
          const trimmedProfiles: Record<string, any> = {};
          profileKeys.slice(-50).forEach(key => {
            trimmedProfiles[key] = profilesObj[key];
          });
          localStorage.setItem(STORAGE_KEYS.AUTHOR_PROFILES, JSON.stringify(trimmedProfiles));
        }
      } catch (e) {
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

// Export storage utilities for other components
export { safeSetItem, cleanupStorage, getAvailableStorage, STORAGE_KEYS }; 