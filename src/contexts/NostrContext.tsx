'use client';

import NDK, { NDKNip07Signer } from '@nostr-dev-kit/ndk';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isWhitelisted as checkWhitelist, ALPHA_WHITELIST } from '@/config/whitelist';
import { getAuthState, setAuthState, clearAuthState } from '@/utils/storage';
import { normalizePublicKey } from '@/utils/nostr';

// Create a singleton NDK instance without signer initially
const ndkInstance = new NDK({
  explicitRelayUrls: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://relay.primal.net',
    'wss://nostr.bitcoiner.social',
    'wss://relay.snort.social'
  ]
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
      
      // Create a promise that rejects after timeout (increased to 20 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 20000);
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
        console.warn('NDK: No relays connected after initialization - will retry later');
        // Don't throw error, just log warning - connection can be retried
      } else {
        console.log(`NDK: Successfully connected to ${connectedRelays.length} relays`);
      }
    } catch (error) {
      console.warn('NDK: Failed to initialize relay connections:', error);
      // Don't throw error - authentication can still work without relays
      // Relays are only needed for fetching/publishing content
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
  isWhitelisted: boolean;
  checkAuthentication: () => Promise<boolean>;
  logout: () => void;
}

const NostrContext = createContext<NostrContextType>({
  ndk: ndkInstance,
  isLoading: true,
  isConnected: false,
  isAuthenticated: false,
  isWhitelisted: false,
  checkAuthentication: async () => false,
  logout: () => {}
});

export const useNostr = () => useContext(NostrContext);

interface NostrProviderProps {
  children: ReactNode;
}

export function NostrProvider({ children }: NostrProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isWhitelisted, setIsWhitelisted] = useState(false);

  const checkAuthentication = async (): Promise<boolean> => {
    try {
      // Only create signer when explicitly checking authentication
      const nip07signer = new NDKNip07Signer();
      ndkInstance.signer = nip07signer;
      
      const user = await nip07signer.user();
      const hasUser = !!user.npub;
      
      if (hasUser) {
        console.log('🔐 Authentication check - User public key:', user.npub);
        
        // Check if the user's public key is whitelisted
        const whitelisted = checkWhitelist(user.npub);
        console.log('📋 Whitelist check result:', whitelisted);
        
        if (!whitelisted) {
          console.warn('🚫 Access denied - User not in whitelist:', {
            npub: user.npub,
            whitelistEnabled: true,
            whitelistKeys: ALPHA_WHITELIST.length
          });
          // Clear any stored auth state if user is not whitelisted
          clearAuthState();
        } else {
          console.log('✅ Access granted - User is whitelisted');
          // Store authentication state for persistence (will be normalized to hex)
          setAuthState(user.npub, true);
        }
        
        setIsWhitelisted(whitelisted);
        setIsAuthenticated(whitelisted); // Only authenticate if whitelisted
        return whitelisted;
      } else {
        console.log('❌ No user found - Authentication failed');
        setIsAuthenticated(false);
        setIsWhitelisted(false);
        clearAuthState();
        return false;
      }
    } catch (error) {
      console.error('NDK Provider: Error checking authentication:', error);
      setIsAuthenticated(false);
      setIsWhitelisted(false);
      clearAuthState();
      return false;
    }
  };

  // Combined initialization effect that handles both connection and authentication
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing app...');
        
        // First, check for stored authentication
        const storedAuth = getAuthState();
        
        if (storedAuth && storedAuth.isWhitelisted) {
          console.log('🔄 Found stored authentication state for:', storedAuth.pubkey);
          
          // Set the stored state immediately for better UX
          setIsAuthenticated(true);
          setIsWhitelisted(true);
          
          // Verify the authentication is still valid with the extension
          try {
            const nostr = window.nostr;
            if (nostr) {
              const currentPubKey = await nostr.getPublicKey();
              console.log('🔍 Current extension pubkey:', currentPubKey);
              console.log('🔍 Stored pubkey:', storedAuth.pubkey);
              
              // Normalize both keys to hex format for comparison
              const normalizedCurrent = normalizePublicKey(currentPubKey);
              const normalizedStored = normalizePublicKey(storedAuth.pubkey);
              
              console.log('🔍 Normalized current pubkey:', normalizedCurrent);
              console.log('🔍 Normalized stored pubkey:', normalizedStored);
              
              if (normalizedCurrent && normalizedStored && normalizedCurrent === normalizedStored) {
                console.log('✅ Stored authentication verified with extension');
                // Authentication is valid, continue with connection
              } else {
                console.log('⚠️ Stored pubkey does not match current extension pubkey');
                clearAuthState();
                setIsAuthenticated(false);
                setIsWhitelisted(false);
              }
            } else {
              console.log('❌ No Nostr extension found');
              clearAuthState();
              setIsAuthenticated(false);
              setIsWhitelisted(false);
            }
          } catch (error) {
            console.log('❌ Could not verify stored authentication with extension:', error);
            clearAuthState();
            setIsAuthenticated(false);
            setIsWhitelisted(false);
          }
        }
        
        // Set loading to false after authentication check (don't wait for relays)
        setIsLoading(false);
        
        // Then check connection in the background
        console.log('NDK Provider: Checking connection...');
        try {
          await initializeNDK();
          const connectedRelays = ndkInstance.pool.connectedRelays();
          console.log('NDK Provider: Connected relays:', connectedRelays.map(r => r.url).join(', '));
          const hasConnectedRelays = connectedRelays.length > 0;
          console.log('NDK Provider: Setting isConnected to:', hasConnectedRelays);
          setIsConnected(hasConnectedRelays);
        } catch (error) {
          console.warn('NDK Provider: Relay connection failed, but continuing with app initialization:', error);
          setIsConnected(false);
          // Don't fail the entire initialization - authentication can still work
        }
        
      } catch (error) {
        console.error('NDK Provider: Error during initialization:', error);
        setIsConnected(false);
        setIsLoading(false);
      }
    };

    initializeApp();

    // Set up an interval to periodically check connection status
    const interval = setInterval(async () => {
      try {
        await initializeNDK();
        const connectedRelays = ndkInstance.pool.connectedRelays();
        const hasConnectedRelays = connectedRelays.length > 0;
        setIsConnected(hasConnectedRelays);
      } catch (error) {
        console.error('NDK Provider: Error checking connection:', error);
        setIsConnected(false);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const logout = () => {
    console.log('🚪 User logging out');
    setIsAuthenticated(false);
    setIsWhitelisted(false);
    clearAuthState();
    // Remove the signer from NDK instance
    ndkInstance.signer = undefined;
  };

  return (
    <NostrContext.Provider value={{ 
      ndk: ndkInstance, 
      isLoading, 
      isConnected, 
      isAuthenticated, 
      isWhitelisted, 
      checkAuthentication,
      logout 
    }}>
      {children}
    </NostrContext.Provider>
  );
} 