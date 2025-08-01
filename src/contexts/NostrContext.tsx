'use client';

import NDK from '@nostr-dev-kit/ndk';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isWhitelisted as checkWhitelist, ALPHA_WHITELIST } from '@/config/whitelist';
import { NostrLoginSigner } from '@/utils/nostrLoginSigner';

// Create a singleton NDK instance without signer initially
const ndkInstance = new NDK({
  explicitRelayUrls: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://relay.primal.net'
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

interface UserProfile {
  pubkey: string;
  npub: string;
  nip05?: string;
  name?: string;
  displayName?: string;
}

interface NostrContextType {
  ndk: NDK;
  isLoading: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  isWhitelisted: boolean;
  currentUser: UserProfile | null;
  checkAuthentication: () => Promise<boolean>;
  logout: () => void;
}

const NostrContext = createContext<NostrContextType>({
  ndk: ndkInstance,
  isLoading: true,
  isConnected: false,
  isAuthenticated: false,
  isWhitelisted: false,
  currentUser: null,
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
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const logout = () => {
    console.log('🚪 Logging out user');
    setIsAuthenticated(false);
    setIsWhitelisted(false);
    setCurrentUser(null);
    ndkInstance.signer = undefined;
  };

  const checkAuthentication = async (): Promise<boolean> => {
    try {
      // Check if window.nostr is available (nostr-login should provide this)
      // Add retry logic for mobile devices where nostr-login might take longer to initialize
      let nostr = window.nostr;
      let attempts = 0;
      const maxAttempts = 15; // More attempts for mobile
      
      while (!nostr && attempts < maxAttempts) {
        console.log(`NDK Provider: Waiting for window.nostr (attempt ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 300));
        nostr = window.nostr;
        attempts++;
      }
      
      if (!nostr) {
        console.log('❌ window.nostr not available - nostr-login may not be initialized');
        setIsAuthenticated(false);
        setIsWhitelisted(false);
        setCurrentUser(null);
        return false;
      }

      // Get the user's public key from nostr-login
      const pubkey = await nostr.getPublicKey();
      
      if (!pubkey) {
        console.log('❌ No user found - Authentication failed');
        setIsAuthenticated(false);
        setIsWhitelisted(false);
        setCurrentUser(null);
        return false;
      }

              // Convert hex pubkey to npub format using bech32
        let npub = pubkey; // Default fallback
        try {
          const { bech32 } = await import('bech32');
          const words = bech32.toWords(Buffer.from(pubkey, 'hex'));
          npub = bech32.encode('npub', words);
        } catch (error) {
          console.error('Error converting hex to npub:', error);
          // Keep pubkey as fallback
        }

      // Check if we already have this user authenticated
      if (isAuthenticated && currentUser && currentUser.pubkey === pubkey) {
        console.log('🔐 User already authenticated, skipping duplicate check');
        return true;
      }
      
      console.log('🔐 Authentication check - User public key:', npub);
      
      // Check if the user's public key is whitelisted
      const whitelisted = checkWhitelist(npub);
      console.log('📋 Whitelist check result:', whitelisted);
      
      if (!whitelisted) {
        console.warn('🚫 Access denied - User not in whitelist:', {
          npub: npub,
          whitelistEnabled: true,
          whitelistKeys: ALPHA_WHITELIST.length
        });
        setIsAuthenticated(false);
        setIsWhitelisted(false);
        setCurrentUser(null);
        return false;
      } else {
        console.log('✅ Access granted - User is whitelisted');
        
        // Set up NDK signer using nostr-login
        ndkInstance.signer = new NostrLoginSigner(ndkInstance);
        
        // Fetch and cache the user's profile
        try {
          const ndkUser = ndkInstance.getUser({ pubkey: pubkey });
          const profile = await ndkUser.fetchProfile();
          
          const userProfile: UserProfile = {
            pubkey: pubkey,
            npub: npub,
            nip05: profile?.nip05,
            name: profile?.name,
            displayName: profile?.displayName
          };
          
          console.log('👤 Cached user profile:', userProfile);
          setCurrentUser(userProfile);
        } catch (profileError) {
          console.warn('⚠️ Failed to fetch user profile, using basic info:', profileError);
          // Still cache basic user info even if profile fetch fails
          const userProfile: UserProfile = {
            pubkey: pubkey,
            npub: npub
          };
          setCurrentUser(userProfile);
        }
        
        setIsWhitelisted(true);
        setIsAuthenticated(true);
        return true;
      }
    } catch (error) {
      console.error('NDK Provider: Error checking authentication:', error);
      setIsAuthenticated(false);
      setIsWhitelisted(false);
      setCurrentUser(null);
      return false;
    }
  };

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
      } catch (error) {
        console.error('NDK Provider: Error checking connection:', error);
        setIsConnected(false);
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
    <NostrContext.Provider value={{ ndk: ndkInstance, isLoading, isConnected, isAuthenticated, isWhitelisted, currentUser, checkAuthentication, logout }}>
      {children}
    </NostrContext.Provider>
  );
} 