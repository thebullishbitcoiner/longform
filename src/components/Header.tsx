'use client';

import { useState, useEffect } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { APP_VERSION } from '../config/version';
import { useNostr } from '@/contexts/NostrContext';
import Link from 'next/link';
import './Header.css';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, logout } = useNostr();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLinkClick = () => {
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header-container">
        <Link href="/" className="header-title">
          Longform._
        </Link>
        <button
          onClick={() => setIsMenuOpen(true)}
          className="menu-button"
        >
          <Bars3Icon className="menu-icon" />
        </button>
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
            <Link href="/reader" className="menu-link" onClick={handleLinkClick}>
              Reader
            </Link>
            {isAuthenticated && (
              <button 
                onClick={handleLogout}
                className="menu-link"
              >
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