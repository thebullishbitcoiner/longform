'use client';

import { useEffect, useRef } from 'react';
import { useNostr } from '@/contexts/NostrContext';

export function NostrLoginProvider() {
  const { checkAuthentication, logout } = useNostr();
  const authCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const initNostrLogin = async () => {
      // Prevent multiple initializations
      if (isInitializedRef.current) {
        console.log('NostrLoginProvider: Already initialized, skipping');
        return;
      }

      if (initPromiseRef.current) {
        console.log('NostrLoginProvider: Initialization already in progress, waiting...');
        await initPromiseRef.current;
        return;
      }

      initPromiseRef.current = (async () => {
        try {
          console.log('NostrLoginProvider: Starting initialization...');
          
          const { init } = await import('nostr-login');
          
          // Detect mobile device for longer timeout
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const maxInitAttempts = isMobile ? 8 : 5;
          const retryDelay = isMobile ? 1500 : 1000;
          
          let initAttempts = 0;
          
          while (initAttempts < maxInitAttempts) {
            try {
              console.log(`NostrLoginProvider: Initializing nostr-login (attempt ${initAttempts + 1}/${maxInitAttempts})`);
              
              init({
                theme: 'default',
                startScreen: 'welcome',
                bunkers: 'nsec.app,highlighter.com',
                perms: 'sign_event:1,sign_event:0',
                darkMode: true,
                noBanner: true
              });

              console.log('✅ Nostr-login initialized successfully');
              isInitializedRef.current = true;
              break;
            } catch (initError) {
              console.warn(`⚠️ Nostr-login init attempt ${initAttempts + 1} failed:`, initError);
              initAttempts++;
              
              if (initAttempts < maxInitAttempts) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              } else {
                console.error('❌ Failed to initialize nostr-login after all attempts');
                throw initError;
              }
            }
          }
        } catch (error) {
          console.error('❌ Failed to initialize nostr-login:', error);
          throw error;
        }
      })();

      return initPromiseRef.current;
    };

    // Listen for nostr-login auth events
    const handleAuthEvent = async (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log('📡 Nostr-login auth event received:', customEvent.detail);
      
      if (customEvent.detail.type === 'login' || customEvent.detail.type === 'signup') {
        console.log('🔐 User authenticated, checking authentication...');
        
        // Clear any existing timeout
        if (authCheckTimeoutRef.current) {
          clearTimeout(authCheckTimeoutRef.current);
        }
        
        // Use longer delay for mobile devices
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const delay = isMobile ? 500 : 200;
        
        authCheckTimeoutRef.current = setTimeout(async () => {
          await checkAuthentication();
        }, delay);
      } else if (customEvent.detail.type === 'logout') {
        console.log('🚪 User logged out');
        logout();
      }
    };

    // Initialize nostr-login
    initNostrLogin().catch(error => {
      console.error('NostrLoginProvider: Initialization failed:', error);
    });

    // Add event listeners
    document.addEventListener('nlAuth', handleAuthEvent);

    return () => {
      document.removeEventListener('nlAuth', handleAuthEvent);
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current);
      }
    };
  }, [checkAuthentication, logout]);

  return null; // This component doesn't render anything
} 