'use client';

import { useState, useEffect } from 'react';
import Longform from '@/components/Longform';
import { useNostr } from '@/contexts/NostrContext';
import toast from 'react-hot-toast';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const { isLoading: contextLoading, isAuthenticated, isWhitelisted, checkAuthentication } = useNostr();

  // Check if user needs to re-authenticate with extension
  useEffect(() => {
    const checkExtensionAuth = async () => {
      if (isAuthenticated && !contextLoading) {
        try {
          const nostr = window.nostr;
          if (nostr) {
            // Try to get public key to verify extension is still available
            await nostr.getPublicKey();
            setNeedsReauth(false);
          } else {
            setNeedsReauth(true);
          }
        } catch (error) {
          console.log('Extension authentication check failed:', error);
          setNeedsReauth(true);
        }
      }
    };

    checkExtensionAuth();
  }, [isAuthenticated, contextLoading]);

  const handleLogin = async () => {
    setIsLoading(true);
    setNeedsReauth(false);
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

  // Show loading state while context is initializing
  if (contextLoading) {
    return (
      <main className="container">
        <div className="welcome-section">
          <div className="welcome-content">
            <h1 className="welcome-title">A focused space for Nostr longform.</h1>
            <p className="welcome-description">
              Loading...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || needsReauth) {
    return (
      <main className="container">
        <div className="welcome-section">
          <div className="welcome-content">
            <h1 className="welcome-title">A focused space for Nostr longform.</h1>
            <p className="welcome-description">
              Create, edit, and read longform content in a clean, distraction-free environment.
            </p>
            {needsReauth && (
              <div className="reauth-notice">
                <p>🔐 Please re-authenticate with your Nostr extension to continue.</p>
              </div>
            )}
            <button 
              onClick={handleLogin}
              disabled={isLoading}
              className="login-button"
            >
              {isLoading ? 'Connecting...' : needsReauth ? 'Re-authenticate' : 'Login with Nostr'}
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
      <Longform />
    </main>
  );
}
