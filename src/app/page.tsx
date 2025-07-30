'use client';

import Longform from '@/components/Longform';
import { useNostr } from '@/contexts/NostrContext';

export default function Home() {
  const { isAuthenticated, isWhitelisted } = useNostr();

  const handleLogin = () => {
    // Launch nostr-login welcome screen
    document.dispatchEvent(new CustomEvent('nlLaunch', { detail: 'welcome' }));
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
