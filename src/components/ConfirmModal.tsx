import { XMarkIcon } from '@heroicons/react/24/outline';
import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message,
  confirmText = 'Yes',
  cancelText = 'No'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.message}>{message}</p>
          <div className={styles.buttonGroup}>
            <button onClick={onClose} className={styles.cancelButton}>
              {cancelText}
            </button>
            <button onClick={onConfirm} className={styles.confirmButton}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 