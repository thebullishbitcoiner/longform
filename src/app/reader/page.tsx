'use client';

import { useState, useEffect, memo } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useBlog, BlogPost } from '@/contexts/BlogContext';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { nip19 } from 'nostr-tools';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useSwipeable } from 'react-swipeable';
import { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk';

function getTagValue(tags: string[][], tagName: string): string | undefined {
  return tags.find(tag => tag[0] === tagName)?.[1];
}

function getTagValues(tags: string[][], tagName: string): string[] {
  return tags.filter(tag => tag[0] === tagName).map(tag => tag[1]);
}

const PostCard = memo(({ post }: { post: BlogPost }) => {
  const { isPostRead, markPostAsRead, markPostAsUnread } = useBlog();
  
  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (!isPostRead(post.id)) {
        markPostAsRead(post.id);
        toast.success('Marked as read');
      }
    },
    onSwipedRight: () => {
      if (isPostRead(post.id)) {
        markPostAsUnread(post.id);
        toast.success('Marked as unread');
      }
    },
    trackMouse: true,
    delta: 10,
    swipeDuration: 500,
  });

  return (
    <div {...handlers} className={styles.swipeContainer}>
      <Link href={`/reader/${post.id}`} className={`${styles.postCard} ${isPostRead(post.id) ? styles.read : ''}`}>
        <div className={styles.readIndicator} />
        {post.image && (
          <div className={styles.postCardImage}>
            <img src={post.image} alt={post.title} loading="lazy" />
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
    </div>
  );
});

PostCard.displayName = 'PostCard';

export default function ReaderPage() {
  const { ndk, isLoading } = useNostr();
  const { getSortedPosts, addPost, updateAuthorProfile } = useBlog();
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [processedEvents] = useState(new Set<string>());

  useEffect(() => {
    // Load subscriptions from localStorage
    const savedSubscriptions = localStorage.getItem('long_subscriptions');
    if (savedSubscriptions) {
      const subs = JSON.parse(savedSubscriptions);
      setSubscriptions(subs);
    }
  }, []); // Only run once on mount

  useEffect(() => {
    let sub: NDKSubscription | null = null;

    // Subscribe to blog posts if NDK is ready and we have subscriptions
    if (ndk && subscriptions.length > 0) {
      sub = ndk.subscribe(
        {
          kinds: [30023],
          authors: subscriptions
        },
        { closeOnEose: false }
      );

      const handleEvent = async (event: NDKEvent) => {
        // Skip if we've already processed this event
        if (processedEvents.has(event.id)) return;
        processedEvents.add(event.id);

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
      };

      sub.on('event', handleEvent);
    }

    // Cleanup subscription on unmount or when dependencies change
    return () => {
      if (sub) {
        sub.stop();
      }
    };
  }, [ndk, subscriptions, addPost, updateAuthorProfile, processedEvents]);

  const handleAddNpub = async () => {
    const npub = prompt('Enter npub:');
    if (!npub) return;

    try {
      // Convert npub to hex
      const decoded = nip19.decode(npub);
      if (decoded.type !== 'npub') {
        toast.error('Invalid npub format');
        return;
      }
      const hexPubkey = decoded.data;

      // Save to localStorage
      const newSubscriptions = [...subscriptions, hexPubkey];
      localStorage.setItem('long_subscriptions', JSON.stringify(newSubscriptions));
      setSubscriptions(newSubscriptions);

      // Subscribe to blog events
      if (ndk) {
        ndk.subscribe(
          { kinds: [30023], authors: [hexPubkey] },
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

        toast.success('Successfully subscribed to ' + npub);
      }
    } catch (error) {
      console.error('Error adding subscription:', error);
      toast.error('Failed to add subscription');
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  const sortedPosts = getSortedPosts();

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Reads</h1>
          <button onClick={handleAddNpub} className={styles.addButton}>
            <PlusIcon className={styles.icon} />
            Add npub
          </button>
        </div>
        <div className={styles.postsGrid}>
          {sortedPosts.map((post) => (
            <PostCard key={post.id} post={post} />
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