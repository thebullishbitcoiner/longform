/**
 * Centralized relay configuration for the Longform application
 * 
 * This file contains all default relay lists used throughout the application.
 * Update these lists here to change relays across the entire app.
 */

/**
 * Default relay list for general Nostr operations
 * Used for: NDK initialization, general event publishing/reading
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net'
];

/**
 * Contact list specific relays
 * Used for: Contact list queries (kind 3 events)
 * These relays are known to have good contact list data
 */
export const CONTACT_LIST_RELAYS = [
  'wss://purplepag.es'
];

/**
 * Get default relays for a specific use case
 * @param useCase - The use case for the relays
 * @returns Array of relay URLs
 */
export function getDefaultRelays(useCase: 'default' | 'contact-list' = 'default'): string[] {
  switch (useCase) {
    case 'contact-list':
      return [...CONTACT_LIST_RELAYS];
    case 'default':
    default:
      return [...DEFAULT_RELAYS];
  }
}

/**
 * Validate if a relay URL is in our default lists
 * @param url - The relay URL to check
 * @returns True if the relay is in any default list
 */
export function isDefaultRelay(url: string): boolean {
  return DEFAULT_RELAYS.includes(url) || CONTACT_LIST_RELAYS.includes(url);
}




