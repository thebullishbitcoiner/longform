import React from 'react';
import { ArrowPathIcon, BoltIcon, ChatBubbleLeftIcon, HeartIcon } from '@heroicons/react/24/outline';
import styles from './page.module.css';

interface ArticleEngagementProps {
  zaps: number;
  likes: number;
  comments: number;
  reposts: number;
  onZapsClick: () => void;
  onReactionsClick: () => void;
  onCommentsClick: () => void;
  onRepostsClick: () => void;
  onHeartClick: () => void;
  isSubmittingHeartReaction: boolean;
}

export default function ArticleEngagement({
  zaps,
  likes,
  comments,
  reposts,
  onZapsClick,
  onReactionsClick,
  onCommentsClick,
  onRepostsClick,
  onHeartClick,
  isSubmittingHeartReaction,
}: ArticleEngagementProps) {
  return (
    <>
      <div className={styles.statsSection}>
        <button className={styles.statItem} onClick={onZapsClick}>
          {zaps} Zap{zaps !== 1 ? 's' : ''}
        </button>
        <button className={styles.statItem} onClick={onReactionsClick}>
          {likes} Reaction{likes !== 1 ? 's' : ''}
        </button>
        <button className={styles.statItem} onClick={onCommentsClick}>
          {comments} Comment{comments !== 1 ? 's' : ''}
        </button>
        <button className={styles.statItem} onClick={onRepostsClick}>
          {reposts} Repost{reposts !== 1 ? 's' : ''}
        </button>
      </div>

      <div className={styles.actionIcons}>
        <BoltIcon className={styles.actionIcon} />
        <HeartIcon
          className={`${styles.actionIcon} ${isSubmittingHeartReaction ? styles.actionIconLoading : ''}`}
          onClick={onHeartClick}
        />
        <ChatBubbleLeftIcon className={styles.actionIcon} />
        <ArrowPathIcon className={styles.actionIcon} />
      </div>
    </>
  );
}
