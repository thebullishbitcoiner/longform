import React, { useState } from 'react';
import { XMarkIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import styles from './JsonModal.module.css';

interface JsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: unknown;
  className?: string;
}

export default function JsonModal({ 
  isOpen, 
  onClose, 
  data, 
  className = '' 
}: JsonModalProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyToClipboard = async () => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonString);
      
      // Show feedback for 2 seconds
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`${styles.modalOverlay} ${className}`} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleContainer}>
            <h2 className={styles.modalTitle}>Event JSON</h2>
            <button 
              className={styles.copyButton}
              onClick={handleCopyToClipboard}
              disabled={isCopied}
              title={isCopied ? "Copied!" : "Copy JSON to clipboard"}
            >
              {isCopied ? (
                <>
                  <CheckIcon className={styles.copyIcon} />
                  <span className={styles.copiedText}>Copied</span>
                </>
              ) : (
                <ClipboardDocumentIcon className={styles.copyIcon} />
              )}
            </button>
          </div>
          <button 
            className={styles.modalCloseButton}
            onClick={onClose}
          >
            <XMarkIcon className={styles.modalCloseIcon} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <pre className={styles.jsonPre}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
