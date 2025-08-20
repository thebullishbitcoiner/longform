'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, UserIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { APP_VERSION } from '../config/version';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNostr } from '@/contexts/NostrContext';
import Image from 'next/image';
import './Header.css';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, currentUser, logout } = useNostr();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLinkClick = () => {
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    setIsMenuOpen(false);
    logout();
    router.replace('/');
  };

  // Get the user's profile identifier (NIP-05 or npub)
  const getUserProfileUrl = () => {
    if (!currentUser) return null;
    const identifier = currentUser.nip05 || currentUser.npub;
    return `/profile/${encodeURIComponent(identifier)}`;
  };

  return (
    <header className="header">
      <div className="header-container">
        <Link href="/" className="header-title">
          Longform._
        </Link>
        {isAuthenticated && (
          <button
            onClick={() => setIsMenuOpen(true)}
            className="menu-container"
          >
            {currentUser?.picture ? (
              <Image
                src={currentUser.picture}
                alt={currentUser.displayName || currentUser.name || 'Profile'}
                width={32}
                height={32}
                className="profile-picture"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : (
              <div className="profile-picture-placeholder">
                <UserIcon className="placeholder-icon" />
              </div>
            )}
            <Bars3Icon className="menu-icon" />
          </button>
        )}
      </div>

      {isMenuOpen && (
        <div className="menu-overlay">
          <button
            onClick={() => setIsMenuOpen(false)}
            className="close-button"
          >
            <XMarkIcon className="menu-icon" />
          </button>
          <div className="menu-items">
            <Link href="/" className="menu-link" onClick={handleLinkClick}>
              Home
            </Link>
            {isAuthenticated && getUserProfileUrl() && (
              <Link href={getUserProfileUrl()!} className="menu-link" onClick={handleLinkClick}>
                Profile
              </Link>
            )}
            {isAuthenticated && (
              <Link href="/settings" className="menu-link" onClick={handleLinkClick}>
                Settings
              </Link>
            )}
            {isAuthenticated && (
              <Link href="/dashboard" className="menu-link" onClick={handleLinkClick}>
                Dashboard
              </Link>
            )}
            <Link href="/reader" className="menu-link" onClick={handleLinkClick}>
              Reader
            </Link>
            {isAuthenticated && (
              <button onClick={handleLogout} className="menu-link">
                Logout
              </button>
            )}
            {mounted && <div className="menu-version">v{APP_VERSION}</div>}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header; 