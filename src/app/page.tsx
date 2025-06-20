'use client';

import { useState } from 'react';
import DraftList from '@/components/DraftList';
import { useNostr } from '@/contexts/NostrContext';
import toast from 'react-hot-toast';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, isWhitelisted, checkAuthentication } = useNostr();

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
      const authResult = await checkAuthentication();
      
      // Show toast if authentication failed due to whitelist
      if (!authResult) {
        toast.error('Access denied: This app is currently in alpha testing. Only approved testers can access the app.', {
          duration: 6000,
          position: 'top-center',
        });
      }
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
              Create, edit, and read longform content in a clean, distraction-free environment.
            </p>
            <button 
              onClick={handleLogin}
              disabled={isLoading}
              className="login-button"
            >
              {isLoading ? 'Connecting...' : 'Login with Nostr'}
            </button>
            {isAuthenticated === false && !isWhitelisted && (
              <div className="whitelist-notice">
                <p>⚠️ This app is currently in alpha testing. Access is restricted to approved testers.</p>
              </div>
            )}
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
