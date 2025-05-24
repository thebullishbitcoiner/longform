'use client';

import { useEffect, useState } from 'react';
import styles from './NostrLogin.module.css';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'nostr-login': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'data-dark-mode'?: string;
        'data-theme'?: string;
        'data-title'?: string;
        'data-description'?: string;
        'data-start-screen'?: string;
      }, HTMLElement>;
    }
  }
}

export default function NostrLogin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Load nostr-login script
    const script = document.createElement('script');
    script.src = 'https://www.unpkg.com/nostr-login@latest/dist/unpkg.js';
    script.setAttribute('data-dark-mode', 'true');
    script.setAttribute('data-theme', 'default');
    script.setAttribute('data-title', 'Welcome to Long');
    script.setAttribute('data-description', 'A minimalist editor for Nostr longform');
    script.setAttribute('data-start-screen', 'welcome-login');
    script.async = true;
    document.head.appendChild(script);

    const checkLoginStatus = () => {
      const nostrLogin = document.querySelector('nostr-login');
      if (nostrLogin) {
        setIsLoggedIn(nostrLogin.hasAttribute('logged-in'));
      }
    };

    // Initial check
    checkLoginStatus();

    // Set up observer for changes
    const observer = new MutationObserver(checkLoginStatus);
    const nostrLogin = document.querySelector('nostr-login');
    if (nostrLogin) {
      observer.observe(nostrLogin, {
        attributes: true,
        attributeFilter: ['logged-in']
      });
    }

    return () => {
      observer.disconnect();
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    // Create and append the nostr-login element
    const container = document.querySelector(`.${styles.container}`);
    if (container) {
      const nostrLogin = document.createElement('nostr-login');
      container.appendChild(nostrLogin);
    }
  }, []);

  return (
    <div className={styles.container} />
  );
} 