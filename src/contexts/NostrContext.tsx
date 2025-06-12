'use client';

import NDK, { NDKNip07Signer } from '@nostr-dev-kit/ndk';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Create a singleton NDK instance with NIP-07 signer
const nip07signer = new NDKNip07Signer();
const ndkInstance = new NDK({
  explicitRelayUrls: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://relay.primal.net',
    'wss://nostr.bitcoiner.social',
    'wss://relay.snort.social'
  ],
  signer: nip07signer
});

// Initialize connection outside of React lifecycle
let isConnecting = false;
let connectionPromise: Promise<void> | null = null;

const initializeNDK = async () => {
  if (isConnecting) {
    console.log('NDK: Already connecting, returning existing promise');
    return connectionPromise;
  }

  if (connectionPromise) {
    console.log('NDK: Using existing connection promise');
    return connectionPromise;
  }

  isConnecting = true;
  connectionPromise = (async () => {
    console.log('NDK: Starting initialization...');
    try {
      console.log('NDK: Attempting to connect to relays...');
      
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      // Race between connection and timeout
      await Promise.race([
        ndkInstance.connect(),
        timeoutPromise
      ]);
      
      console.log('NDK: Connected to relays');

      // Verify we have at least one connected relay
      const connectedRelays = ndkInstance.pool.connectedRelays();
      console.log('NDK: Connected relays:', connectedRelays.map(r => r.url).join(', '));
      
      if (connectedRelays.length === 0) {
        console.error('NDK: No relays connected after initialization');
        throw new Error('No relays connected');
      }

      console.log(`NDK: Successfully connected to ${connectedRelays.length} relays`);
    } catch (error) {
      console.error('NDK: Failed to initialize:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('NDK: Error name:', error.name);
        console.error('NDK: Error message:', error.message);
        console.error('NDK: Error stack:', error.stack);
      }
      throw error;
    } finally {
      isConnecting = false;
    }
  })();

  return connectionPromise;
};

// Start the connection immediately
initializeNDK().catch(error => {
  console.error('NDK: Initial connection failed:', error);
});

interface NostrContextType {
  ndk: NDK;
  isLoading: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
}

const NostrContext = createContext<NostrContextType>({
  ndk: ndkInstance,
  isLoading: true,
  isConnected: false,
  isAuthenticated: false
});

export const useNostr = () => useContext(NostrContext);

interface NostrProviderProps {
  children: ReactNode;
}

export function NostrProvider({ children }: NostrProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        console.log('NDK Provider: Checking connection...');
        await initializeNDK();
        const connectedRelays = ndkInstance.pool.connectedRelays();
        console.log('NDK Provider: Connected relays:', connectedRelays.map(r => r.url).join(', '));
        const hasConnectedRelays = connectedRelays.length > 0;
        console.log('NDK Provider: Setting isConnected to:', hasConnectedRelays);
        setIsConnected(hasConnectedRelays);

        // Check if we have a NIP-07 signer
        const user = await nip07signer.user();
        setIsAuthenticated(!!user.npub);
      } catch (error) {
        console.error('NDK Provider: Error checking connection:', error);
        setIsConnected(false);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnection();

    // Set up an interval to periodically check connection status
    const interval = setInterval(checkConnection, 30000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <NostrContext.Provider value={{ ndk: ndkInstance, isLoading, isConnected, isAuthenticated }}>
      {children}
    </NostrContext.Provider>
  );
} 