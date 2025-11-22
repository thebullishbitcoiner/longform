import NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { Nip07Signer } from './nip07Signer';

export interface PreferredRelay {
  url: string;
  policy: 'read' | 'write' | 'readwrite';
}

/**
 * Get preferred relays for a user from localStorage
 * @param pubkey - The user's public key
 * @returns Array of preferred relays
 */
export function getPreferredRelays(pubkey: string): PreferredRelay[] {
  try {
    const stored = localStorage.getItem(`preferred_relays_${pubkey}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading preferred relays:', error);
  }
  return [];
}

/**
 * Save preferred relays for a user to localStorage
 * @param pubkey - The user's public key
 * @param relays - Array of preferred relays
 */
export function savePreferredRelays(pubkey: string, relays: PreferredRelay[]): void {
  try {
    localStorage.setItem(`preferred_relays_${pubkey}`, JSON.stringify(relays));
  } catch (error) {
    console.error('Error saving preferred relays:', error);
    throw error;
  }
}

/**
 * Create a NIP-37 preferred relays event with NIP-44 encrypted private tags
 * @param ndk - The NDK instance
 * @param relays - Array of preferred relays
 * @param userPubkey - The user's public key
 * @returns Promise that resolves to the NDKEvent
 */
export async function createPreferredRelaysEvent(
  ndk: NDK,
  relays: PreferredRelay[]
): Promise<NDKEvent> {
  const event = new (await import('@nostr-dev-kit/ndk')).NDKEvent(ndk);
  event.kind = 10013; // NIP-37 preferred relays kind
  event.created_at = Math.floor(Date.now() / 1000);
  
  // Create private tags with relay information
  const privateTags: Array<[string, string, string]> = [];
  relays.forEach(relay => {
    privateTags.push(['r', relay.url, relay.policy]);
  });
  
  // Encrypt private tags using NIP-44
  if (!ndk.signer) {
    throw new Error('NDK signer not available');
  }
  
  const privateTagsJson = JSON.stringify(privateTags);
  // Type assertion since we know our signer has NIP-44 methods
  const encryptedContent = await (ndk.signer as Nip07Signer).encryptNip44(privateTagsJson);
  event.content = encryptedContent;
  
  return event;
}

/**
 * Parse a NIP-37 preferred relays event with NIP-44 encrypted private tags
 * @param event - The NDKEvent containing preferred relays data
 * @param ndk - The NDK instance
 * @returns Promise that resolves to array of preferred relays
 */
export async function parsePreferredRelaysEvent(
  event: NDKEvent,
  ndk: NDK
): Promise<PreferredRelay[]> {
  if (!ndk.signer) {
    throw new Error('NDK signer not available');
  }
  
  try {
    // Decrypt the content using NIP-44
    const decryptedContent = await (ndk.signer as Nip07Signer).decryptNip44(event.content);
    const privateTags = JSON.parse(decryptedContent);
    
    const relays: PreferredRelay[] = [];
    privateTags.forEach((tag: string[]) => {
      if (tag[0] === 'r' && tag[1]) {
        const url = tag[1];
        const policy = (tag[2] as 'read' | 'write' | 'readwrite') || 'readwrite';
        
        relays.push({
          url,
          policy
        });
      }
    });
    
    return relays;
  } catch (error) {
    console.error('Error parsing preferred relays event:', error);
    return [];
  }
}

/**
 * Get relays for publishing events based on NIP-37
 * @param pubkey - The user's public key
 * @param eventKind - The kind of event being published
 * @returns Array of relay URLs to use for publishing this event
 */
export function getRelaysForPublishingEvent(pubkey: string, eventKind: number): string[] {
  // Only apply preferred relays for private events (kind 4)
  if (eventKind !== 4) {
    return [];
  }

  const preferredRelays = getPreferredRelays(pubkey);
  
  // Return URLs of relays that have 'write' or 'readwrite' policy
  return preferredRelays
    .filter(relay => relay.policy === 'write' || relay.policy === 'readwrite')
    .map(relay => relay.url);
}

/**
 * Get relays for private events based on NIP-37
 * @param pubkey - The user's public key
 * @param eventKind - The kind of event (4 for private messages)
 * @returns Array of relay URLs to use for this event
 */
export function getRelaysForPrivateEvent(pubkey: string, eventKind: number): string[] {
  // Only apply preferred relays for private events (kind 4)
  if (eventKind !== 4) {
    return [];
  }

  const preferredRelays = getPreferredRelays(pubkey);
  
  // Return URLs of relays that have 'write' or 'readwrite' policy
  return preferredRelays
    .filter(relay => relay.policy === 'write' || relay.policy === 'readwrite')
    .map(relay => relay.url);
}

/**
 * Get relays for reading private events based on NIP-37
 * @param pubkey - The user's public key
 * @returns Array of relay URLs to query for private events
 */
export function getRelaysForReadingPrivateEvents(pubkey: string): string[] {
  const preferredRelays = getPreferredRelays(pubkey);
  
  // Return URLs of relays that have 'read' or 'readwrite' policy
  return preferredRelays
    .filter(relay => relay.policy === 'read' || relay.policy === 'readwrite')
    .map(relay => relay.url);
}

/**
 * Validate a relay URL
 * @param url - The relay URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidRelayUrl(url: string): boolean {
  if (!url.trim()) return false;
  
  // Must start with wss:// or ws://
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
    return false;
  }
  
  // Basic URL structure validation
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'wss:' || urlObj.protocol === 'ws:';
  } catch {
    return false;
  }
}

/**
 * Test connection to a relay
 * @param url - The relay URL to test
 * @returns Promise that resolves to true if connection successful, false otherwise
 */
export async function testRelayConnection(url: string): Promise<boolean> {
  try {
    // Import NDK dynamically to avoid SSR issues
    const { default: NDK } = await import('@nostr-dev-kit/ndk');
    
    const testNDK = new NDK({
      explicitRelayUrls: [url]
    });
    
    await testNDK.connect();
    const connectedRelays = testNDK.pool.connectedRelays();
    
    return connectedRelays.length > 0;
  } catch (error) {
    console.error('Error testing relay connection:', error);
    return false;
  }
} 