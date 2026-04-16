import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { nip19 } from 'nostr-tools';
import styles from './page.module.css';
import type { BlogPost } from '@/contexts/BlogContext';
import type { TopZapBadge } from './interactionTypes';

const FallbackAvatar = ({ name, pubkey }: { name?: string; pubkey: string }) => {
  const initials = name ? name.slice(0, 2).toUpperCase() : pubkey.slice(0, 2).toUpperCase();
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const colorIndex = pubkey.charCodeAt(0) % colors.length;

  return (
    <div className={styles.topZapFallbackAvatar} style={{ backgroundColor: colors[colorIndex] }}>
      {initials}
    </div>
  );
};

interface ArticleHeaderProps {
  post: BlogPost;
  authorDisplayName: string;
  showAuthorLoading: boolean;
  topZapBadges: TopZapBadge[];
  totalZapCount: number;
  onOpenAllZaps: () => void;
  engagement: React.ReactNode;
}

export default function ArticleHeader({
  post,
  authorDisplayName,
  showAuthorLoading,
  topZapBadges,
  totalZapCount,
  onOpenAllZaps,
  engagement,
}: ArticleHeaderProps) {
  return (
    <>
      {post.image && (
        <div className={styles.postImage}>
          <Image
            src={post.image}
            alt={post.title}
            width={800}
            height={400}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 800px"
            style={{ width: '100%', height: 'auto' }}
            priority
            unoptimized
          />
        </div>
      )}

      <header className={styles.header}>
        <h1 className={styles.title}>{post.title}</h1>
        <div className={styles.metadata}>
          <div className={styles.author}>
            <div className={styles.authorLine}>
              <span className={styles.label}>Author:</span>
              <Link
                href={`/profile/${nip19.npubEncode(post.pubkey)}`}
                className={styles.authorValue}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {authorDisplayName}
              </Link>
              {showAuthorLoading && <span className={styles.loadingIndicator}> (loading...)</span>}
            </div>
            <div className={styles.date}>
              <span className={styles.label}>Published:</span>
              <time>
                {new Date(post.created_at * 1000).toLocaleDateString()}
                {post.client && <span className={styles.clientInfo}> via {post.client}</span>}
              </time>
            </div>
          </div>
        </div>

        {post.tags.length > 0 && (
          <div className={styles.tags}>
            {post.tags.map((tag: string) => (
              <span key={tag} className={styles.tag}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {topZapBadges.length > 0 && (
          <div className={styles.topZapBadgesRow}>
            {topZapBadges.map((zap, index) => (
              <div
                key={zap.id}
                className={index === 0 ? `${styles.topZapBadge} ${styles.topZapBadgeLead}` : styles.topZapBadge}
              >
                <div className={styles.topZapBadgeMain}>
                  {zap.authorPicture ? (
                    <Image
                      src={zap.authorPicture}
                      alt=""
                      width={26}
                      height={26}
                      className={styles.topZapAvatar}
                      unoptimized
                    />
                  ) : (
                    <FallbackAvatar name={zap.authorName} pubkey={zap.pubkey} />
                  )}
                  <span className={styles.topZapAmount}>{zap.amount.toLocaleString()}</span>
                  {index === 0 && zap.zapMessage ? (
                    <span className={styles.topZapMessage} title={zap.zapMessage}>
                      {zap.zapMessage}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {totalZapCount > topZapBadges.length ? (
              <button
                type="button"
                className={styles.topZapMoreButton}
                onClick={onOpenAllZaps}
                aria-label="View all zaps"
              >
                <EllipsisHorizontalIcon className={styles.topZapMoreIcon} />
              </button>
            ) : null}
          </div>
        )}

        {engagement}
      </header>
    </>
  );
}
