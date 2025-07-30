'use client';

import { useEffect, useRef } from 'react';
import { useNostr } from '@/contexts/NostrContext';

export function NostrLoginProvider() {
  const { checkAuthentication, logout } = useNostr();
  const authCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const initNostrLogin = async () => {
      try {
        const { init } = await import('nostr-login');
        
        init({
          theme: 'default',
          startScreen: 'welcome',
          bunkers: 'nsec.app,highlighter.com',
          perms: 'sign_event:1,sign_event:0',
          darkMode: true,
          noBanner: false
        });

        console.log('✅ Nostr-login initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize nostr-login:', error);
      }
    };

    // Listen for nostr-login auth events
    const handleAuthEvent = async (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log('📡 Nostr-login auth event received:', customEvent.detail);
      
      if (customEvent.detail.type === 'login' || customEvent.detail.type === 'signup') {
        console.log('🔐 User authenticated, checking authentication...');
        
        // Debounce authentication check to prevent multiple rapid calls
        if (authCheckTimeoutRef.current) {
          clearTimeout(authCheckTimeoutRef.current);
        }
        
        authCheckTimeoutRef.current = setTimeout(async () => {
          await checkAuthentication();
        }, 100);
      } else if (customEvent.detail.type === 'logout') {
        console.log('🚪 User logged out');
        logout();
      }
    };

    // Initialize nostr-login
    initNostrLogin();

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