import { normalizePublicKey } from './nostr';

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

// Authentication storage keys
const AUTH_STORAGE_KEY = 'longform_auth_state';
const AUTH_TIMESTAMP_KEY = 'longform_auth_timestamp';

// Security settings
const AUTH_EXPIRY_HOURS = 12; // Reduced from 24 hours for better security
const AUTH_MAX_AGE = AUTH_EXPIRY_HOURS * 60 * 60 * 1000; // Convert to milliseconds

// Authentication state interface
export interface AuthState {
  pubkey: string; // Hex format of the public key
  isWhitelisted: boolean;
  timestamp: number;
}

// Get stored authentication state
export function getAuthState(): AuthState | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const authData = localStorage.getItem(AUTH_STORAGE_KEY);
    const timestamp = localStorage.getItem(AUTH_TIMESTAMP_KEY);
    
    if (!authData || !timestamp) return null;
    
    const authState: AuthState = JSON.parse(authData);
    const storedTimestamp = parseInt(timestamp, 10);
    
    // Check if authentication is still valid
    const now = Date.now();
    
    if (now - storedTimestamp > AUTH_MAX_AGE) {
      // Authentication expired, clear it
      console.log('🔒 Authentication expired, clearing stored state');
      clearAuthState();
      return null;
    }
    
    // Additional validation: ensure the stored data has required fields
    if (!authState.pubkey || typeof authState.isWhitelisted !== 'boolean') {
      console.warn('🔒 Invalid auth state format, clearing stored state');
      clearAuthState();
      return null;
    }
    
    return authState;
  } catch (error) {
    console.error('Error reading auth state from storage:', error);
    // Clear potentially corrupted data
    clearAuthState();
    return null;
  }
}

// Store authentication state
export function setAuthState(npub: string, isWhitelisted: boolean): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Normalize the public key to hex format for consistent storage
    const hexPubKey = normalizePublicKey(npub);
    if (!hexPubKey) {
      console.error('Invalid public key format for storage:', npub);
      return;
    }
    
    const authState: AuthState = {
      pubkey: hexPubKey, // Store hex format for consistent comparison
      isWhitelisted,
      timestamp: Date.now()
    };
    
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
    localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.error('Error storing auth state:', error);
  }
}

// Clear authentication state
export function clearAuthState(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TIMESTAMP_KEY);
    console.log('🔒 Authentication state cleared from localStorage');
  } catch (error) {
    console.error('Error clearing auth state:', error);
  }
}

// Clear all app data (for security purposes)
export function clearAllAppData(): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Clear authentication data
    clearAuthState();
    
    // Clear drafts (optional - you might want to keep these)
    // localStorage.removeItem('drafts');
    
    console.log('🔒 All app data cleared from localStorage');
  } catch (error) {
    console.error('Error clearing app data:', error);
  }
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