'use client';

import NDK from '@nostr-dev-kit/ndk';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface NostrContextType {
  ndk: NDK | null;
  isLoading: boolean;
}

const NostrContext = createContext<NostrContextType>({
  ndk: null,
  isLoading: true,
});

export const useNostr = () => useContext(NostrContext);

interface NostrProviderProps {
  children: ReactNode;
}

export function NostrProvider({ children }: NostrProviderProps) {
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeNDK = async () => {
      try {
        const ndkInstance = new NDK({
          explicitRelayUrls: [
            'wss://relay.damus.io',
            'wss://relay.nostr.band',
            'wss://relay.primal.net',
            'wss://nostr.bitcoiner.social',
            'wss://relay.nostr.bg',
            'wss://relay.snort.social'
          ],
        });

        // Connect to relays
        await ndkInstance.connect();

        // Verify we have at least one connected relay
        const connectedRelays = ndkInstance.pool.connectedRelays;
        if (connectedRelays.length === 0) {
          console.error('No relays connected after initialization');
          throw new Error('No relays connected');
        }

        console.log(`Connected to ${connectedRelays.length} relays`);
        setNdk(ndkInstance);
      } catch (error) {
        console.error('Failed to initialize NDK:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeNDK();
  }, []);

  return (
    <NostrContext.Provider value={{ ndk, isLoading }}>
      {children}
    </NostrContext.Provider>
  );
} 