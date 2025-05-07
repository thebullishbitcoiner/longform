import React from 'react';
import { APP_VERSION } from '../config/version';
import './Header.css';

const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header-container">
        <h1 className="header-title">
          Long
          <span className="header-version">v{APP_VERSION}</span>
        </h1>
      </div>
    </header>
  );
};

export default Header; 