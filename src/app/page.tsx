'use client';

import Longform from '@/components/Longform';
import { useNostr } from '@/contexts/NostrContext';

export default function Home() {
  const { isAuthenticated, checkAuthentication } = useNostr();

  const handleLogin = async () => {
    // Request access to Nostr extension
    if (!window.nostr) {
      alert('Please install a Nostr extension (like nos2x, Alby, or similar) to login.');
      return;
    }
    // The extension will prompt the user to authorize
    try {
      await window.nostr.getPublicKey();
      // Re-check authentication after user authorizes
      await checkAuthentication();
    } catch (error) {
      console.error('Failed to get public key:', error);
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
            >
              Login with Nostr
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
