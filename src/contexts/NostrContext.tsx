'use client';

import NDK, { NDKKind } from '@nostr-dev-kit/ndk';
import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';

import { Nip07Signer } from '@/utils/nip07Signer';
import { DEFAULT_RELAYS } from '@/config/relays';
import { KIND_PREFERRED_RELAYS } from '@/nostr/kinds';
import { nostrDebug } from '@/nostr/debug';
import { hexToNpub } from '@/utils/nostr';
import { parsePreferredRelaysEvent, savePreferredRelays } from '@/utils/preferredRelays';

const CONNECT_TIMEOUT_MS = 10000;
const CONNECTION_POLL_MS = 30000;
const AUTH_DEBOUNCE_MS = 1000;

const uniqueRelays = (relays: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const relay of relays) {
    const value = relay.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
};

const relaySignature = (relays: string[]): string => uniqueRelays(relays).sort().join('|');

const createNDKClient = (relays: string[]): NDK => {
  return new NDK({
    explicitRelayUrls: uniqueRelays(relays),
  });
};

let ndkInstance = createNDKClient(DEFAULT_RELAYS);
let activeRelaySignature = relaySignature(DEFAULT_RELAYS);

let connectionPromise: Promise<void> | null = null;
let connectingSignature: string | null = null;

const initializeNDK = async (targetNDK: NDK, targetSignature: string): Promise<void> => {
  if (connectionPromise && connectingSignature === targetSignature) {
    nostrDebug('NDK: Reusing in-flight connection for relays:', targetSignature);
    return connectionPromise;
  }

  connectingSignature = targetSignature;
  connectionPromise = (async () => {
    nostrDebug('NDK: Starting initialization...');
    try {
      nostrDebug('NDK: Attempting to connect to relays...');
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECT_TIMEOUT_MS);
      });

      await Promise.race([
        targetNDK.connect(),
        timeoutPromise
      ]);
      
      nostrDebug('NDK: Connected to relays');

      const connectedRelays = targetNDK.pool.connectedRelays();
      nostrDebug('NDK: Connected relays:', connectedRelays.map(r => r.url).join(', '));
      
      if (connectedRelays.length === 0) {
        console.warn('NDK: No relays connected after initialization, but continuing...');
      } else {
        nostrDebug(`NDK: Successfully connected to ${connectedRelays.length} relays`);
      }
    } catch (error) {
      console.error('NDK: Failed to initialize:', error);
      if (error instanceof Error) {
        console.error('NDK: Error name:', error.name);
        console.error('NDK: Error message:', error.message);
        console.error('NDK: Error stack:', error.stack);
      }
    } finally {
      connectingSignature = null;
    }
  })();

  return connectionPromise;
};

const swapNDK = (relays: string[], signer?: Nip07Signer): { ndk: NDK; signature: string; changed: boolean } => {
  const mergedRelays = uniqueRelays(relays);
  const signature = relaySignature(mergedRelays);

  if (signature === activeRelaySignature) {
    if (signer) ndkInstance.signer = signer;
    return { ndk: ndkInstance, signature, changed: false };
  }

  const nextNDK = createNDKClient(mergedRelays);
  if (signer) nextNDK.signer = signer;

  ndkInstance = nextNDK;
  activeRelaySignature = signature;
  connectionPromise = null;
  connectingSignature = null;

  nostrDebug('NDK: Swapped instance with relays:', mergedRelays);
  return { ndk: nextNDK, signature, changed: true };
};

interface UserProfile {
  pubkey: string;
  npub: string;
  nip05?: string;
  name?: string;
  displayName?: string;
  picture?: string;
}

interface NostrContextType {
  ndk: NDK;
  isLoading: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  currentUser: UserProfile | null;
  checkAuthentication: () => Promise<boolean>;
  logout: () => void;
}

const NostrContext = createContext<NostrContextType>({
  ndk: ndkInstance,
  isLoading: true,
  isConnected: false,
  isAuthenticated: false,
  currentUser: null,
  checkAuthentication: async () => false,
  logout: () => {}
});

export const useNostr = () => useContext(NostrContext);

interface NostrProviderProps {
  children: ReactNode;
}

export function NostrProvider({ children }: NostrProviderProps) {
  const [ndk, setNdk] = useState(ndkInstance);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  
  const ndkRef = useRef(ndk);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const currentUserRef = useRef(currentUser);
  const relaySignatureRef = useRef(activeRelaySignature);
  const authPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastAuthCheckRef = useRef<number>(0);

  useEffect(() => {
    ndkRef.current = ndk;
  }, [ndk]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const applyRelayPreferences = useCallback(async (pubkey: string, signer: Nip07Signer): Promise<NDK> => {
    let fromNetwork: string[] = [];

    try {
      const events = await ndkRef.current.fetchEvents({
        kinds: [KIND_PREFERRED_RELAYS as NDKKind],
        authors: [pubkey],
        limit: 1,
      });

      if (events.size > 0) {
        const latest = Array.from(events)[0];
        const parsed = await parsePreferredRelaysEvent(latest, ndkRef.current);
        savePreferredRelays(pubkey, parsed);
        fromNetwork = parsed.map((relay) => relay.url);
      }
    } catch (error) {
      console.warn('NDK: Failed to load preferred relays from network:', error);
    }

    const mergedRelays = uniqueRelays([
      ...DEFAULT_RELAYS,
      ...fromNetwork,
    ]);

    const { ndk: mergedNDK, signature, changed } = swapNDK(mergedRelays, signer);
    ndkRef.current = mergedNDK;
    relaySignatureRef.current = signature;

    if (changed) {
      setNdk(mergedNDK);
      await initializeNDK(mergedNDK, signature);
    }

    return mergedNDK;
  }, []);

  const logout = () => {
    nostrDebug('🚪 Logging out user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    ndkRef.current.signer = undefined;
  };

  const checkAuthentication = useCallback(async (): Promise<boolean> => {
    if (authPromiseRef.current) {
      nostrDebug('🔐 Authentication check already in progress; returning same promise');
      return authPromiseRef.current;
    }

    const now = Date.now();
    const timeSinceLastCheck = now - lastAuthCheckRef.current;
    if (timeSinceLastCheck < AUTH_DEBOUNCE_MS) {
      nostrDebug(`🔐 Authentication check debounced (${timeSinceLastCheck}ms since last check)`);
      return isAuthenticatedRef.current;
    }

    lastAuthCheckRef.current = now;
    const authPromise = (async () => {
      try {
        if (!window.nostr) {
          nostrDebug('❌ window.nostr not available - Please install a Nostr extension');
          setIsAuthenticated(false);
          setCurrentUser(null);
          return false;
        }
        
        nostrDebug('✅ window.nostr is available, proceeding with authentication');

        nostrDebug('🔐 Getting public key from Nostr extension...');
        const pubkey = await window.nostr.getPublicKey();
        nostrDebug('🔐 Retrieved pubkey:', pubkey ? `${pubkey.slice(0, 8)}...` : 'null');
        
        if (!pubkey) {
          nostrDebug('❌ No user found - Authentication failed');
          setIsAuthenticated(false);
          setCurrentUser(null);
          return false;
        }

        const npub = hexToNpub(pubkey) ?? pubkey;

        if (isAuthenticatedRef.current && currentUserRef.current?.pubkey === pubkey) {
          nostrDebug('🔐 User already authenticated, skipping duplicate check');
          return true;
        }
        
        nostrDebug('🔐 Authentication check - User public key:', npub);

        const signer = new Nip07Signer(ndkRef.current);
        ndkRef.current.signer = signer;

        const effectiveNDK = await applyRelayPreferences(pubkey, signer);
        effectiveNDK.signer = signer;

        try {
          const ndkUser = effectiveNDK.getUser({ pubkey });
          const profile = await ndkUser.fetchProfile();
          
          const userProfile: UserProfile = {
            pubkey,
            npub,
            nip05: profile?.nip05,
            name: profile?.name,
            displayName: profile?.displayName,
            picture: profile?.image,
          };
          
          nostrDebug('👤 Cached user profile:', userProfile);
          setCurrentUser(userProfile);
        } catch (profileError) {
          console.warn('⚠️ Failed to fetch user profile, using basic info:', profileError);
          setCurrentUser({ pubkey, npub });
        }
        
        setIsAuthenticated(true);
        return true;
      } catch (error) {
        console.error('NDK Provider: Error checking authentication:', error);
        setIsAuthenticated(false);
        setCurrentUser(null);
        return false;
      } finally {
        authPromiseRef.current = null;
      }
    })();

    authPromiseRef.current = authPromise;
    return authPromise;
  }, [applyRelayPreferences]);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        nostrDebug('NDK Provider: Checking connection...');
        await initializeNDK(ndkRef.current, relaySignatureRef.current);
        const connectedRelays = ndkRef.current.pool.connectedRelays();
        nostrDebug('NDK Provider: Connected relays:', connectedRelays.map(r => r.url).join(', '));
        const hasConnectedRelays = connectedRelays.length > 0;
        nostrDebug('NDK Provider: Setting isConnected to:', hasConnectedRelays);
        setIsConnected(hasConnectedRelays);
      } catch (error) {
        console.error('NDK Provider: Error checking connection:', error);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    const initializeAuth = async () => {
      try {
        nostrDebug('NDK Provider: Checking authentication on initialization...');
        const authResult = await checkAuthentication();
        nostrDebug('NDK Provider: Authentication result:', authResult);
      } catch (error) {
        console.error('NDK Provider: Error checking authentication on init:', error);
      }
    };

    checkConnection();
    initializeAuth();

    const interval = setInterval(checkConnection, CONNECTION_POLL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [checkAuthentication]);

  return (
    <NostrContext.Provider value={{ ndk, isLoading, isConnected, isAuthenticated, currentUser, checkAuthentication, logout }}>
      {children}
    </NostrContext.Provider>
  );
} 