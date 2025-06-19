'use client';

import { useState } from 'react';
import DraftList from '@/components/DraftList';
import { useNostr } from '@/contexts/NostrContext';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, checkAuthentication } = useNostr();

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const nostr = window.nostr;
      if (!nostr) {
        alert('Please install a Nostr extension like nos2x, Alby, or similar to use this app.');
        return;
      }

      // Request permission to sign
      await nostr.getPublicKey();
      // Check authentication status in context
      await checkAuthentication();
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="container">
        <div className="welcome-section">
          <div className="welcome-content">
            <h1 className="welcome-title">A focused space for Nostr longform.</h1>
            <p className="welcome-description">
              Create, edit, and read longform content with a clean, distraction-free experience.
            </p>
            <button 
              onClick={handleLogin}
              disabled={isLoading}
              className="login-button"
            >
              {isLoading ? 'Connecting...' : 'Login with Nostr'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <DraftList />
    </main>
  );
}
