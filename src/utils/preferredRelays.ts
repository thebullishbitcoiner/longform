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