import { NDKEvent } from '@nostr-dev-kit/ndk';
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
  event.kind = 10002; // NIP-65 relay list kind
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
 * Convert PreferredRelay format to RelayInfo format
 * @param preferredRelays - Array of PreferredRelay objects
 * @returns Array of RelayInfo objects
 */
export function convertPreferredToRelayInfo(preferredRelays: Array<{url: string, policy: 'read' | 'write' | 'readwrite'}>): RelayInfo[] {
  return preferredRelays.map(relay => ({
    url: relay.url,
    read: relay.policy === 'read' || relay.policy === 'readwrite',
    write: relay.policy === 'write' || relay.policy === 'readwrite'
  }));
}

/**
 * Convert RelayInfo format to PreferredRelay format
 * @param relayInfos - Array of RelayInfo objects
 * @returns Array of PreferredRelay objects
 */
export function convertRelayInfoToPreferred(relayInfos: RelayInfo[]): Array<{url: string, policy: 'read' | 'write' | 'readwrite'}> {
  return relayInfos.map(relay => ({
    url: relay.url,
    policy: relay.read && relay.write ? 'readwrite' : relay.read ? 'read' : 'write'
  }));
} 