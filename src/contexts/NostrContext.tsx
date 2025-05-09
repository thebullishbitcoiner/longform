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
            'wss://relay.nostr.band'
          ],
        });

        await ndkInstance.connect();
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