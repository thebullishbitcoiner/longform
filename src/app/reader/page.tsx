'use client';

import { useState, useEffect, memo, useRef } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useBlog, BlogPost } from '@/contexts/BlogContext';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import { NDKSubscription } from '@nostr-dev-kit/ndk';

function getTagValue(tags: string[][], tagName: string): string | undefined {
  return tags.find(tag => tag[0] === tagName)?.[1];
}

function getTagValues(tags: string[][], tagName: string): string[] {
  return tags.filter(tag => tag[0] === tagName).map(tag => tag[1]);
}

const PostCard = memo(({ post }: { post: BlogPost }) => {
  const { isPostRead, markPostAsRead, markPostAsUnread } = useBlog();
  const x = useMotionValue(0);
  const controls = useAnimation();
  
  // Transform x position to opacity for the action indicators
  const leftOpacity = useTransform(x, [-30, -15], [1, 0]);
  const rightOpacity = useTransform(x, [15, 30], [0, 1]);
  
  // Transform x position to scale for the card
  const scale = useTransform(x, [-100, 0, 100], [0.98, 1, 0.98]);

  // Add haptic feedback if available
  const vibrate = (pattern: number | number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const handleDragEnd = async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 150; // Reduced threshold for easier triggering
    const velocity = info.velocity.x;
    
    if ((info.offset.x < -threshold || velocity < -800) && !isPostRead(post.id)) {
      vibrate(50); // Short vibration for read action
      await controls.start({ 
        x: -600,
        opacity: 0,
        transition: { 
          duration: 0.2,
          ease: [0.4, 0, 0.2, 1] // Custom easing for smoother animation
        }
      });
      markPostAsRead(post.id);
      toast.success('Marked as read');
      controls.set({ x: 0, opacity: 1 });
    } else if ((info.offset.x > threshold || velocity > 800) && isPostRead(post.id)) {
      vibrate(50); // Short vibration for unread action
      await controls.start({ 
        x: 600,
        opacity: 0,
        transition: { 
          duration: 0.2,
          ease: [0.4, 0, 0.2, 1] // Custom easing for smoother animation
        }
      });
      markPostAsUnread(post.id);
      toast.success('Marked as unread');
      controls.set({ x: 0, opacity: 1 });
    } else {
      vibrate(20); // Light vibration for bounce back
      controls.start({ 
        x: 0,
        transition: {
          type: "spring",
          stiffness: 500, // Increased stiffness for snappier response
          damping: 30, // Adjusted damping for better bounce
          mass: 0.8 // Added mass for more natural feel
        }
      });
    }
  };

  return (
    <div className={styles.swipeContainer}>
      <motion.div 
        className={`${styles.swipeAction} ${styles.swipeActionLeft}`}
        style={{ opacity: leftOpacity }}
        initial={{ opacity: 0 }}
      >
        Mark as read
      </motion.div>
      <motion.div 
        className={`${styles.swipeAction} ${styles.swipeActionRight}`}
        style={{ opacity: rightOpacity }}
        initial={{ opacity: 0 }}
      >
        Mark as unread
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -300, right: 300 }}
        dragElastic={0.1} // Reduced elastic for more controlled feel
        dragDirectionLock
        dragTransition={{ bounceStiffness: 400, bounceDamping: 30 }}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x, scale }}
        className={`${styles.postCard} ${isPostRead(post.id) ? styles.read : ''}`}
      >
        <Link href={`/reader/${post.id}`} className={styles.postCardLink}>
          <div className={styles.readIndicator} />
          <div className={styles.postCardContent}>
            <div className={styles.postCardHeader}>
              <h2 className={styles.postCardTitle}>{post.title}</h2>
              <div className={styles.postCardMeta}>
                <span className={styles.postCardAuthor}>
                  {post.author?.displayName || post.author?.name || post.pubkey.slice(0, 8) + '...'}
                </span>
                <div className={styles.postCardDate}>
                  <time>{new Date(post.created_at * 1000).toLocaleDateString()}</time>
                </div>
              </div>
            </div>
            {post.summary && (
              <p className={styles.postCardSummary}>{post.summary}</p>
            )}
          </div>
        </Link>
      </motion.div>
    </div>
  );
});

PostCard.displayName = 'PostCard';

export default function ReaderPage() {
  const { ndk, isLoading } = useNostr();
  const { getSortedPosts, addPost, updateAuthorProfile, clearPosts, isPostRead } = useBlog();
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const processedEvents = useRef(new Set<string>());
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');
  const hasClearedPosts = useRef(false);
  const subscriptionRef = useRef<NDKSubscription | null>(null);

  useEffect(() => {
    // Load subscriptions from localStorage
    const savedSubscriptions = localStorage.getItem('long_subscriptions');
    if (savedSubscriptions) {
      const subs = JSON.parse(savedSubscriptions);
      setSubscriptions(subs);
      // Clear posts when subscriptions change
      clearPosts();
      hasClearedPosts.current = false;
    } else if (!hasClearedPosts.current) {
      // Clear posts if no subscriptions exist and we haven't cleared them yet
      clearPosts();
      setSubscriptions([]);
      hasClearedPosts.current = true;
    }
  }, [clearPosts]);

  useEffect(() => {
    const setupSubscription = async () => {
      // Clean up any existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
        subscriptionRef.current = null;
      }

      // Clear processed events
      processedEvents.current.clear();

      // Only proceed if we have NDK and subscriptions
      if (!ndk || subscriptions.length === 0) {
        return;
      }

      try {
        // Create filter object explicitly
        const filter = {
          kinds: [30023],
          authors: subscriptions
        };

        // Create new subscription with explicit filter and handlers
        subscriptionRef.current = ndk.subscribe(
          filter,
          { 
            closeOnEose: false,
            groupable: false // Disable filter merging
          },
          {
            onEvent: async (event) => {
              // Skip if we've already processed this event
              if (processedEvents.current.has(event.id)) return;
              processedEvents.current.add(event.id);

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
            },
            onEose: (subscription) => {
              console.log('Subscription reached EOSE:', subscription.internalId);
            }
          }
        );
      } catch (error) {
        console.error('Error setting up subscription:', error);
      }
    };

    // Set up the subscription
    setupSubscription();

    // Cleanup subscription on unmount or when dependencies change
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
        subscriptionRef.current = null;
      }
    };
  }, [ndk, subscriptions, addPost, updateAuthorProfile]);

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  const sortedPosts = getSortedPosts();
  const filteredPosts = sortedPosts
    .filter(post => subscriptions.includes(post.pubkey)) // Only show posts from current subscriptions
    .filter(post => {
      switch (filter) {
        case 'read':
          return isPostRead(post.id);
        case 'unread':
          return !isPostRead(post.id);
        default:
          return true;
      }
    });

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Reads</h1>
          <div className={styles.filterButtons}>
            <button
              onClick={() => setFilter('all')}
              className={`${styles.filterButton} ${filter === 'all' ? styles.filterButtonActive : ''}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`${styles.filterButton} ${filter === 'unread' ? styles.filterButtonActive : ''}`}
            >
              Unread
            </button>
            <button
              onClick={() => setFilter('read')}
              className={`${styles.filterButton} ${filter === 'read' ? styles.filterButtonActive : ''}`}
            >
              Read
            </button>
          </div>
        </div>
        <div className={styles.postsGrid}>
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {filteredPosts.length === 0 && (
            <div className={styles.emptyState}>
              {subscriptions.length === 0 ? (
                <>
                  You don&apos;t have any reads. Add an npub in the{' '}
                  <Link href="/subscriptions" className={styles.emptyStateLink}>
                    subscriptions
                  </Link>
                  {' '}page!
                </>
              ) : filter === 'all' ? (
                "No blog posts found from your subscriptions."
              ) : filter === 'read' ? (
                "No read posts found."
              ) : (
                "No unread posts found."
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 