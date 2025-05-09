'use client';

import { useState } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { APP_VERSION } from '../config/version';
import Link from 'next/link';
import './Header.css';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLinkClick = () => {
    setIsMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header-container">
        <h1 className="header-title">
          Long
          <span className="header-version">v{APP_VERSION}</span>
        </h1>
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
          </div>
        </div>
      )}
    </header>
  );
};

export default Header; 