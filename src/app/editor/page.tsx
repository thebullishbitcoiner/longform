'use client';

import Longform from '@/components/Longform';
import { useNostr } from '@/contexts/NostrContext';

export default function Editor() {
  const { isAuthenticated } = useNostr();

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
