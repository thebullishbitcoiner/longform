import React from 'react';
import './Header.css';

const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header-container">
        <h1 className="header-title">
          Long
          <span className="header-version">v0.0.3</span>
        </h1>
      </div>
    </header>
  );
};

export default Header; 