import { NDKEvent } from '@nostr-dev-kit/ndk';
import { KIND_RELAY_LIST } from '@/nostr/kinds';
import { safeSetItem, STORAGE_KEYS } from './storage';

export interface RelayInfo {
  url: string;
  read: boolean;
  write: boolean;
}

export interface RelayList {
  relays: RelayInfo[];
  created_at: number;
}

/**
 * Create a NIP-65 relay list event
 * @param relays - Array of relay information
 * @returns NDKEvent ready to be published
 */
export function createRelayListEvent(relays: RelayInfo[]): NDKEvent {
  const event = new NDKEvent();
  event.kind = KIND_RELAY_LIST;
  event.created_at = Math.floor(Date.now() / 1000);
  
  // Convert relays to tags format: ["r", "relay_url", "read"|"write"]
  const tags: string[][] = [];
  
  relays.forEach(relay => {
    if (relay.read && relay.write) {
      tags.push(['r', relay.url]); // Omit marker for read+write (default)
    } else if (relay.read) {
      tags.push(['r', relay.url, 'read']);
    } else if (relay.write) {
      tags.push(['r', relay.url, 'write']);
    }
  });
  
  event.tags = tags;
  return event;
}

/**
 * Parse a NIP-65 relay list event
 * @param event - The NDKEvent containing relay list data
 * @returns Array of relay information
 */
export function parseRelayListEvent(event: NDKEvent): RelayInfo[] {
  const relays: RelayInfo[] = [];
  
  event.tags.forEach(tag => {
    if (tag[0] === 'r' && tag[1]) {
      const url = tag[1];
      const permission = tag[2] || 'readwrite';
      
      const relayInfo: RelayInfo = {
        url,
        read: permission === 'read' || permission === 'readwrite',
        write: permission === 'write' || permission === 'readwrite'
      };
      
      // Avoid duplicates
      if (!relays.some(r => r.url === url)) {
        relays.push(relayInfo);
      }
    }
  });
  
  return relays;
}

/**
 * Get relay list from localStorage
 * @param pubkey - The user's public key
 * @returns Array of relay information
 */
export function getRelayList(pubkey: string): RelayInfo[] {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEYS.RELAY_LIST_PREFIX}${pubkey}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading relay list:', error);
  }
  return [];
}

/**
 * Save relay list to localStorage
 * @param pubkey - The user's public key
 * @param relays - Array of relay information
 */
export function saveRelayList(pubkey: string, relays: RelayInfo[]): void {
  try {
    const success = safeSetItem(`${STORAGE_KEYS.RELAY_LIST_PREFIX}${pubkey}`, JSON.stringify(relays));
    if (!success) {
      console.warn('Failed to save relay list due to storage constraints');
    }
  } catch (error) {
    console.error('Error saving relay list:', error);
    throw error;
  }
}

/**
 * Validate a relay URL
 * @param url - The relay URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidRelayUrl(url: string): boolean {
  if (!url.trim()) return false;

  if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
    return false;
  }

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