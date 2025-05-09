'use client';

import { useState, useEffect } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useBlog, BlogPost } from '@/contexts/BlogContext';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { nip19 } from 'nostr-tools';

function getTagValue(tags: string[][], tagName: string): string | undefined {
  return tags.find(tag => tag[0] === tagName)?.[1];
}

function getTagValues(tags: string[][], tagName: string): string[] {
  return tags.filter(tag => tag[0] === tagName).map(tag => tag[1]);
}

export default function ReaderPage() {
  const { ndk, isLoading } = useNostr();
  const { getSortedPosts, addPost, updateAuthorProfile } = useBlog();
  const [subscriptions, setSubscriptions] = useState<string[]>([]);

  useEffect(() => {
    // Load subscriptions from localStorage
    const savedSubscriptions = localStorage.getItem('long_subscriptions');
    if (savedSubscriptions) {
      const subs = JSON.parse(savedSubscriptions);
      setSubscriptions(subs);
      
      // Subscribe to blog posts if NDK is ready
      if (ndk && subs.length > 0) {
        ndk.subscribe(
          { kinds: [30023], authors: subs },
          { closeOnEose: false },
          {
            onEvent: async (event) => {
              try {
                const title = getTagValue(event.tags, 'title') || 'Untitled';
                const summary = getTagValue(event.tags, 'summary') || '';
                const published_at = parseInt(getTagValue(event.tags, 'published_at') || event.created_at.toString());
                const image = getTagValue(event.tags, 'image');
                const tags = getTagValues(event.tags, 't');

                const post: BlogPost = {
                  id: event.id,
                  pubkey: event.pubkey,
                  created_at: event.created_at,
                  content: event.content,
                  title,
                  summary,
                  published_at,
                  image,
                  tags
                };

                addPost(post);

                // Fetch profile if we haven't already
                const user = ndk.getUser({ pubkey: event.pubkey });
                const profile = await user.fetchProfile();
                if (profile) {
                  updateAuthorProfile(event.pubkey, {
                    name: profile.name,
                    displayName: profile.displayName
                  });
                }
              } catch (error) {
                console.error('Error processing blog post:', error);
              }
            }
          }
        );
      }
    }
  }, [ndk, addPost, updateAuthorProfile]);

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  const sortedPosts = getSortedPosts();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.postsGrid}>
          {sortedPosts.map((post) => (
            <Link href={`/reader/${post.id}`} key={post.id} className={styles.postCard}>
              {post.image && (
                <div className={styles.postCardImage}>
                  <img src={post.image} alt={post.title} />
                </div>
              )}
              <div className={styles.postCardContent}>
                <h2 className={styles.postCardTitle}>{post.title}</h2>
                {post.summary && (
                  <p className={styles.postCardSummary}>{post.summary}</p>
                )}
                <div className={styles.postCardMeta}>
                  <span className={styles.postCardAuthor}>
                    {post.author?.displayName || post.author?.name || post.pubkey.slice(0, 8) + '...'}
                  </span>
                  <div className={styles.postCardDate}>
                    <span className={styles.dateLabel}>Created On:</span>
                    <time>{new Date(post.created_at * 1000).toLocaleDateString()}</time>
                  </div>
                </div>
                {post.tags.length > 0 && (
                  <div className={styles.postCardTags}>
                    {post.tags.slice(0, 3).map(tag => (
                      <span key={tag} className={styles.postCardTag}>#{tag}</span>
                    ))}
                    {post.tags.length > 3 && (
                      <span className={styles.postCardTag}>+{post.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
          {sortedPosts.length === 0 && subscriptions.length > 0 && (
            <div className={styles.emptyState}>
              No blog posts found from your subscriptions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 