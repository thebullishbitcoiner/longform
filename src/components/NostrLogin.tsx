'use client';

import { useEffect, useState } from 'react';
import styles from './NostrLogin.module.css';

export default function NostrLogin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pubkey, setPubkey] = useState<string | null>(null);

  useEffect(() => {
    // Load nostr-login script
    const script = document.createElement('script');
    script.src = 'https://www.unpkg.com/nostr-login@latest/dist/unpkg.js';
    // Theme and appearance settings
    script.setAttribute('data-dark-mode', 'true');
    script.setAttribute('data-theme', 'default');
    script.setAttribute('data-title', 'Welcome to Long');
    script.setAttribute('data-description', 'A minimalist editor for Nostr longform');
    script.setAttribute('data-start-screen', 'welcome-login');
    script.async = true;
    document.head.appendChild(script);

    // Handle auth events
    const handleAuth = (e: CustomEvent) => {
      if (e.detail.type === 'login' || e.detail.type === 'signup') {
        setIsLoggedIn(true);
        // Get pubkey from window.nostr
        if (window.nostr) {
          window.nostr.getPublicKey().then((pk: string) => {
            setPubkey(pk);
          });
        }
      } else {
        setIsLoggedIn(false);
        setPubkey(null);
      }
    };

    document.addEventListener('nlAuth', handleAuth as EventListener);

    return () => {
      document.removeEventListener('nlAuth', handleAuth as EventListener);
      document.head.removeChild(script);
    };
  }, []);

  if (!isLoggedIn) return null;

  return (
    <div className={styles.container}>
    
    </div>
  );
} 