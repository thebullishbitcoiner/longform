import { nip19 } from 'nostr-tools';
import NDK from '@nostr-dev-kit/ndk';

/**
 * Convert npub to hex public key
 */
export const npubToHex = (npub: string): string | null => {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === 'npub') {
      return decoded.data;
    }
    return null;
  } catch (error) {
    console.error('Error converting npub to hex:', error);
    return null;
  }
};

/**
 * Convert hex public key to npub
 */
export const hexToNpub = (hex: string): string | null => {
  try {
    return nip19.npubEncode(hex);
  } catch (error) {
    console.error('Error converting hex to npub:', error);
    return null;
  }
};

/**
 * Convert hex event ID to note1 format using NIP-19
 */
export const hexToNote1 = (hex: string): string | null => {
  try {
    return nip19.noteEncode(hex);
  } catch (error) {
    console.error('Error converting hex to note1:', error);
    return null;
  }
};

/**
 * Convert note1 to hex event ID
 */
export const note1ToHex = (note1: string): string | null => {
  try {
    const decoded = nip19.decode(note1);
    if (decoded.type === 'note') {
      return decoded.data;
    }
    return null;
  } catch (error) {
    console.error('Error converting note1 to hex:', error);
    return null;
  }
};

/**
 * Normalize a public key to hex format
 * Accepts both npub and hex formats
 */
export const normalizePublicKey = (publicKey: string): string | null => {
  if (publicKey.startsWith('npub')) {
    return npubToHex(publicKey);
  } else if (publicKey.match(/^[0-9a-fA-F]{64}$/)) {
    return publicKey.toLowerCase();
  }
  return null;
};

/**
 * Generate a NIP-05 based URL for a blog post
 * Format: /reader/{author}@{domain}/{d-tag}
 * Example: /reader/thebullishbitcoiner@thebullish.shop/f68aaf1a
 */
export const generateNip05Url = (author: string, dTag: string): string => {
  return `/reader/${author}/${dTag}`;
};

/**
 * Parse a NIP-05 based URL to extract author and d-tag
 * Returns null if the URL format is invalid
 */
export const parseNip05Url = (url: string): { author: string; dTag: string } | null => {
  // Match pattern: /reader/{author}/{d-tag}
  const match = url.match(/^\/reader\/([^\/]+)\/([^\/]+)$/);
  if (match) {
    return {
      author: match[1],
      dTag: match[2]
    };
  }
  return null;
};

/**
 * Get the best identifier for a user (NIP-05 if available, otherwise npub)
 */
export const getUserIdentifier = async (ndk: NDK, pubkey: string): Promise<string> => {
  try {
    const user = ndk.getUser({ pubkey });
    const profile = await user.fetchProfile();
    
    if (profile?.nip05) {
      return profile.nip05;
    }
    
    // Fallback to npub
    const npub = hexToNpub(pubkey);
    return npub || pubkey;
  } catch (error) {
    console.error('Error getting user identifier:', error);
    // Fallback to npub
    const npub = hexToNpub(pubkey);
    return npub || pubkey;
  }
};

/**
 * Get the best identifier for the current logged-in user (uses cached profile)
 * This is much faster than getUserIdentifier as it doesn't need to fetch from relays
 */
export const getCurrentUserIdentifier = (currentUser: { pubkey: string; npub: string; nip05?: string } | null): string => {
  if (!currentUser) {
    throw new Error('No current user available');
  }
  
  // Use NIP-05 if available
  if (currentUser.nip05) {
    return currentUser.nip05;
  }
  
  // Fallback to npub
  return currentUser.npub;
};

/**
 * Resolve a NIP-05 identifier to a pubkey
 */
export const resolveNip05 = async (ndk: NDK, identifier: string): Promise<string | null> => {
  console.log('🔍 DEBUG: resolveNip05 called with identifier:', identifier);
  
  try {
    // Check if it's already a valid hex pubkey
    if (/^[0-9a-fA-F]{64}$/i.test(identifier)) {
      console.log('🔍 DEBUG: Identifier is already a hex pubkey:', identifier);
      return identifier.toLowerCase();
    }
    
    // Check if it's an npub
    if (identifier.startsWith('npub')) {
      console.log('🔍 DEBUG: Converting npub to hex:', identifier);
      return npubToHex(identifier);
    }
    
    // For NIP-05 identifiers, fetch from the domain's .well-known/nostr.json
    if (identifier.includes('@')) {
      const [username, domain] = identifier.split('@');
      
      console.log('🔍 DEBUG: Parsed NIP-05 identifier:', { username, domain });
      
      if (!username || !domain) {
        console.error('🔍 DEBUG: Invalid NIP-05 identifier format:', identifier);
        return null;
      }
      
      try {
        const url = `https://${domain}/.well-known/nostr.json`;
        console.log('🔍 DEBUG: Fetching NIP-05 data from:', url);
        
        // Fetch the NIP-05 JSON from the domain
        const response = await fetch(url);
        
        console.log('🔍 DEBUG: NIP-05 response status:', response.status);
        
        if (!response.ok) {
          console.error(`🔍 DEBUG: Failed to fetch NIP-05 data from ${domain}:`, response.status);
          return null;
        }
        
        const data = await response.json();
        console.log('🔍 DEBUG: NIP-05 data received:', data);
        
        if (data.names && data.names[username]) {
          const pubkey = data.names[username];
          console.log('🔍 DEBUG: Found pubkey for username:', { username, pubkey });
          return pubkey;
        } else {
          console.error(`🔍 DEBUG: NIP-05 identifier ${username} not found in domain ${domain}`);
          console.log('🔍 DEBUG: Available names:', data.names);
          return null;
        }
      } catch (fetchError) {
        console.error(`🔍 DEBUG: Error fetching NIP-05 data from ${domain}:`, fetchError);
        return null;
      }
    }
    
    console.log('🔍 DEBUG: Could not resolve identifier:', identifier);
    return null;
  } catch (error) {
    console.error('🔍 DEBUG: Error resolving NIP-05 identifier:', error);
    return null;
  }
};

/**
 * Validate if a string is a valid public key (npub or hex)
 */
export const isValidPublicKey = (publicKey: string): boolean => {
  if (publicKey.startsWith('npub')) {
    try {
      const decoded = nip19.decode(publicKey);
      return decoded.type === 'npub';
    } catch {
      return false;
    }
  } else if (publicKey.match(/^[0-9a-fA-F]{64}$/)) {
    return true;
  }
  return false;
}; 