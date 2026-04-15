import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { nip19 } from 'nostr-tools';
import styles from './page.module.css';
import type { BlogPost } from '@/contexts/BlogContext';

interface ArticleHeaderProps {
  post: BlogPost;
  authorDisplayName: string;
  showAuthorLoading: boolean;
  engagement: React.ReactNode;
}

export default function ArticleHeader({
  post,
  authorDisplayName,
  showAuthorLoading,
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

        {engagement}
      </header>
    </>
  );
}
