'use client';

import NDK from '@nostr-dev-kit/ndk';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Create a singleton NDK instance
const ndkInstance = new NDK({
  explicitRelayUrls: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://relay.primal.net',
    'wss://nostr.bitcoiner.social',
    'wss://relay.snort.social'
  ],
});

interface NostrContextType {
  ndk: NDK;
  isLoading: boolean;
}

const NostrContext = createContext<NostrContextType>({
  ndk: ndkInstance,
  isLoading: true,
});

export const useNostr = () => useContext(NostrContext);

interface NostrProviderProps {
  children: ReactNode;
}

export function NostrProvider({ children }: NostrProviderProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeNDK = async () => {
      console.log('Starting NDK initialization...');
      try {
        console.log('Attempting to connect to relays...');
        
        // Create a promise that rejects after timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 10000);
        });

        // Race between connection and timeout
        await Promise.race([
          ndkInstance.connect(),
          timeoutPromise
        ]);
        
        console.log('Connected to relays');

        // Verify we have at least one connected relay
        const connectedRelays = ndkInstance.pool.connectedRelays();
        console.log('Connected relays:', connectedRelays.map(r => r.url).join(', '));
        
        if (connectedRelays.length === 0) {
          console.error('No relays connected after initialization');
          throw new Error('No relays connected');
        }

        console.log(`Successfully connected to ${connectedRelays.length} relays`);
      } catch (error) {
        console.error('Failed to initialize NDK:', error);
        // Log more details about the error
        if (error instanceof Error) {
          console.error('Error name:', error.name);
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        }
      } finally {
        console.log('Setting isLoading to false');
        setIsLoading(false);
      }
    };

    initializeNDK();
  }, []);

  return (
    <NostrContext.Provider value={{ ndk: ndkInstance, isLoading }}>
      {children}
    </NostrContext.Provider>
  );
} 