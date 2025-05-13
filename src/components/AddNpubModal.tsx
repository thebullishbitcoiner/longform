import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import toast from 'react-hot-toast';
import styles from './AddNpubModal.module.css';

interface AddNpubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (hexPubkey: string) => void;
  existingSubscriptions: string[];
}

export default function AddNpubModal({ isOpen, onClose, onAdd, existingSubscriptions }: AddNpubModalProps) {
  const [npubInput, setNpubInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNpubInput('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!npubInput.trim()) return;
    
    try {
      // Convert npub to hex
      const decoded = nip19.decode(npubInput.trim());
      if (decoded.type !== 'npub') {
        toast.error('Invalid npub format');
        return;
      }
      const hexPubkey = decoded.data;

      // Check if already subscribed
      if (existingSubscriptions.includes(hexPubkey)) {
        toast.error('Already subscribed to this npub');
        return;
      }

      onAdd(hexPubkey);
      onClose();
      toast.success('Successfully subscribed to ' + npubInput.trim());
    } catch (error) {
      console.error('Error adding subscription:', error);
      toast.error('Failed to add subscription');
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add Subscription</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.inputGroup}>
            <label htmlFor="npub" className={styles.label}>Nostr Public Key (npub)</label>
            <input
              id="npub"
              type="text"
              value={npubInput}
              onChange={(e) => setNpubInput(e.target.value)}
              placeholder="npub1..."
              className={styles.input}
              autoFocus
            />
          </div>
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" className={styles.submitButton}>
              Add Subscription
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 