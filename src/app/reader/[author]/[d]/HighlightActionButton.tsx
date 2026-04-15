import React from 'react';
import { PencilIcon } from '@heroicons/react/24/outline';
import styles from './page.module.css';

interface HighlightActionButtonProps {
  visible: boolean;
  isAuthenticated: boolean;
  onClick: () => void;
  position: {
    top: number;
    left: number;
  };
  isCreatingHighlight: boolean;
}

export default function HighlightActionButton({
  visible,
  isAuthenticated,
  onClick,
  position,
  isCreatingHighlight,
}: HighlightActionButtonProps) {
  if (!visible || !isAuthenticated) return null;

  return (
    <button
      className={styles.highlightButton}
      onClick={onClick}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      disabled={isCreatingHighlight}
    >
      <PencilIcon className={styles.highlightButtonIcon} />
      {isCreatingHighlight ? 'Creating...' : 'Highlight'}
    </button>
  );
}
