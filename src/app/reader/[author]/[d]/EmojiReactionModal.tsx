import React from 'react';
import Image from 'next/image';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import styles from './page.module.css';

interface BasicEmoji {
  emoji: string;
  name: string;
}

interface CustomEmoji {
  name: string;
  url: string;
}

interface EmojiReactionModalProps {
  showEmojiModal: boolean;
  setShowEmojiModal: (open: boolean) => void;
  basicEmojis: BasicEmoji[];
  preferredEmojis: string[];
  showAddEmojiInput: boolean;
  setShowAddEmojiInput: (open: boolean) => void;
  newEmojiInput: string;
  setNewEmojiInput: (value: string) => void;
  handleEmojiInputKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleAddEmoji: () => void;
  handleEmojiSelect: (emoji: string) => void;
  isPro: boolean;
  customEmojis: CustomEmoji[];
  isLoadingCustomEmojis: boolean;
}

export default function EmojiReactionModal({
  showEmojiModal,
  setShowEmojiModal,
  basicEmojis,
  preferredEmojis,
  showAddEmojiInput,
  setShowAddEmojiInput,
  newEmojiInput,
  setNewEmojiInput,
  handleEmojiInputKeyPress,
  handleAddEmoji,
  handleEmojiSelect,
  isPro,
  customEmojis,
  isLoadingCustomEmojis,
}: EmojiReactionModalProps) {
  if (!showEmojiModal) return null;

  return (
    <div className={styles.emojiModalOverlay}>
      <div className={styles.emojiModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.emojiMenuContent}>
          <div className={styles.emojiMenuHeader}>
            <span className={styles.emojiMenuTitle}>Send a reaction</span>
            <button className={styles.emojiMenuClose} onClick={() => setShowEmojiModal(false)}>
              <XMarkIcon className={styles.emojiMenuCloseIcon} />
            </button>
          </div>

          <div className={styles.emojiGrid}>
            {basicEmojis.map((emojiData) => (
              <button
                key={emojiData.emoji}
                className={styles.emojiButton}
                onClick={() => handleEmojiSelect(emojiData.emoji)}
                title={emojiData.name}
              >
                {emojiData.emoji}
              </button>
            ))}

            {preferredEmojis.map((emoji) => (
              <button
                key={emoji}
                className={styles.emojiButton}
                onClick={() => handleEmojiSelect(emoji)}
                title="Preferred emoji"
              >
                {emoji}
              </button>
            ))}

            {!showAddEmojiInput ? (
              <button
                className={styles.emojiButton}
                onClick={() => setShowAddEmojiInput(true)}
                title="Add emoji"
              >
                <PlusIcon className={styles.plusIcon} />
              </button>
            ) : (
              <div className={styles.emojiInputContainer}>
                <input
                  type="text"
                  value={newEmojiInput}
                  onChange={(e) => setNewEmojiInput(e.target.value)}
                  onKeyDown={handleEmojiInputKeyPress}
                  placeholder="Add emoji"
                  className={styles.emojiInput}
                  autoFocus
                />
                <button
                  className={`${styles.emojiButton} ${styles.emojiSymbolButton}`}
                  onClick={handleAddEmoji}
                  title="Add"
                >
                  ✓
                </button>
                <button
                  className={`${styles.emojiButton} ${styles.emojiSymbolButton}`}
                  onClick={() => {
                    setShowAddEmojiInput(false);
                    setNewEmojiInput('');
                  }}
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            )}

            {isPro && customEmojis.length > 0 && (
              <>
                <div className={styles.emojiDivider} />
                {customEmojis.map((customEmoji) => (
                  <button
                    key={customEmoji.name}
                    className={styles.emojiButton}
                    onClick={() => handleEmojiSelect(`:${customEmoji.name}:`)}
                    title={customEmoji.name}
                  >
                    <Image
                      src={customEmoji.url}
                      alt={`:${customEmoji.name}:`}
                      width={20}
                      height={20}
                      sizes="20px"
                      className={styles.customEmoji}
                      unoptimized
                    />
                  </button>
                ))}
              </>
            )}

            {isPro && isLoadingCustomEmojis && (
              <div className={styles.emojiLoading}>Loading custom emojis...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
