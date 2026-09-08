'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Longform from '@/components/Longform';
import { useNostr } from '@/contexts/NostrContext';

export default function Home() {
  const { isAuthenticated, checkAuthentication } = useNostr();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (isLoggingIn) return;

    // Request access to Nostr extension
    if (!window.nostr) {
      toast.error('Please install a Nostr extension (like nos2x, Alby, or similar) to login.');
      return;
    }

    setIsLoggingIn(true);
    try {
      // The extension will prompt the user to authorize
      await window.nostr.getPublicKey();
      // Re-check authentication after user authorizes
      const success = await checkAuthentication();
      if (!success) {
        toast.error('Login failed. Please try again.');
      }
    } catch (error) {
      console.error('Failed to get public key:', error);
      toast.error('Login was cancelled or failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="container">
        <div className="welcome-section">
          <div className="welcome-content">
            <h1 className="welcome-title">A focused space for Nostr longform.</h1>
            <p className="welcome-description">
              Create, edit, and read longform content in a clean, distraction-free environment.
            </p>
            <button
              onClick={handleLogin}
              className="login-button"
              disabled={isLoggingIn}
              aria-busy={isLoggingIn}
            >
              {isLoggingIn ? 'Logging in...' : 'Login with Nostr'}
            </button>
            <div className="beta-notice">
              <p>This app is currently in beta testing.</p>
              <p>If you have any issues, submit it on <a href="https://github.com/thebullishbitcoiner/longform/issues" target="_blank" rel="noopener noreferrer">GitHub</a> or @ me on <a href="https://njump.me/npub15ypxpg429uyjmp0zczuza902chuvvr4pn35wfzv8rx6cej4z8clq6jmpcx" target="_blank" rel="noopener noreferrer">Nostr</a>.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <Longform />
    </main>
  );
}
