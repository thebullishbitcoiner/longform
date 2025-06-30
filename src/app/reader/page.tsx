'use client';

import { useState, useEffect, memo, useRef, useCallback } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useBlog, BlogPost } from '@/contexts/BlogContext';
import Link from 'next/link';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import { NDKSubscription } from '@nostr-dev-kit/ndk';


// Configuration: Specify which relays to use for contact list queries
// You can modify this list to use only the relays you trust
const CONTACT_LIST_RELAYS = [
  'wss://relay.nostr.band', 
  'wss://purplepag.es'
];

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
  const { ndk, isLoading, isAuthenticated, isConnected } = useNostr();
  const { getSortedPosts, addPost, updateAuthorProfile, clearPosts, isPostRead } = useBlog();
  const [follows, setFollows] = useState<string[]>([]);
  const processedEvents = useRef(new Set<string>());
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');
  const hasClearedPosts = useRef(false);
  const subscriptionRef = useRef<NDKSubscription | null>(null);
  const [isLoadingFollows, setIsLoadingFollows] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const setupSubscriptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch current user's follows (contact list)
  const fetchFollows = useCallback(async () => {
    console.log('🔍 DEBUG: fetchFollows called', { 
      ndk: !!ndk, 
      isAuthenticated, 
      isConnected,
      isLoading 
    });
    
    if (!ndk || !isAuthenticated || !isConnected || isLoading) {
      console.log('❌ DEBUG: Cannot fetch follows - missing requirements');
      setFollows([]);
      return;
    }

    setIsLoadingFollows(true);
    
    try {
      // Get current user
      const user = await ndk.signer?.user();
      console.log('👤 DEBUG: Current user:', user ? { pubkey: user.pubkey, npub: user.npub } : 'null');
      
      if (!user?.pubkey) {
        console.log('❌ DEBUG: No authenticated user found');
        setFollows([]);
        return;
      }

      console.log('🔍 DEBUG: Fetching follows for user:', user.pubkey);

      // Function to fetch contact list from a specific relay
      const fetchFromRelay = async (relayUrl: string) => {
        try {
          console.log(`📡 DEBUG: Querying relay: ${relayUrl}`);
          const events = await ndk.fetchEvents({
            kinds: [3],
            authors: [user.pubkey],
            limit: 1
          }, {
            relayUrls: [relayUrl]
          });
          
          if (events.size > 0) {
            const event = Array.from(events)[0];
            console.log(`✅ DEBUG: Found contact list on ${relayUrl}:`, {
              id: event.id,
              created_at: event.created_at,
              timestamp: new Date(event.created_at * 1000).toISOString(),
              tagsCount: event.tags.length
            });
            return event;
          } else {
            console.log(`❌ DEBUG: No contact list found on ${relayUrl}`);
            return null;
          }
        } catch (error) {
          console.log(`⚠️ DEBUG: Error querying ${relayUrl}:`, error);
          return null;
        }
      };

      // Query from specific trusted relays
      const trustedRelays = CONTACT_LIST_RELAYS;

      console.log('📡 DEBUG: Querying trusted relays for contact list...');
      
      // Query each relay individually to see which has the most recent contact list
      const relayResults = await Promise.all(
        trustedRelays.map(async (relay) => {
          const event = await fetchFromRelay(relay);
          return { relay, event };
        })
      );

      // Find the most recent contact list from all relays
      const validResults = relayResults.filter(result => result.event !== null);
      
      if (validResults.length > 0) {
        // Sort by created_at to find the most recent
        validResults.sort((a, b) => b.event!.created_at - a.event!.created_at);
        const mostRecent = validResults[0];
        
        console.log('🏆 DEBUG: Most recent contact list found on:', mostRecent.relay);
        console.log('📋 DEBUG: Contact list details:', {
          relay: mostRecent.relay,
          id: mostRecent.event!.id,
          created_at: mostRecent.event!.created_at,
          timestamp: new Date(mostRecent.event!.created_at * 1000).toISOString(),
          tagsCount: mostRecent.event!.tags.length
        });

        // Extract pubkeys from contact list tags
        const followPubkeys = mostRecent.event!.tags
          .filter(tag => tag[0] === 'p')
          .map(tag => tag[1])
          .filter(Boolean);

        console.log('👥 DEBUG: Found follows:', {
          count: followPubkeys.length,
          firstFew: followPubkeys.slice(0, 5),
          sourceRelay: mostRecent.relay,
          mostRecentEventAge: Math.floor((Date.now() / 1000) - mostRecent.event!.created_at) + ' seconds ago'
        });
        setFollows(followPubkeys);
      } else {
        console.log('❌ DEBUG: No contact list found on any relay');
        setFollows([]);
      }
    } catch (error) {
      console.error('❌ DEBUG: Error fetching follows:', error);
      setFollows([]);
    } finally {
      setIsLoadingFollows(false);
    }
  }, [ndk, isAuthenticated, isConnected, isLoading]);

  // Fetch follows when authentication status changes
  useEffect(() => {
    if (isAuthenticated && isConnected && !isLoading) {
      fetchFollows();
    } else {
      setFollows([]);
    }
  }, [isAuthenticated, isConnected, isLoading, fetchFollows]);

  // Clear posts when follows change
  useEffect(() => {
    if (follows.length === 0 && !hasClearedPosts.current) {
      clearPosts();
      hasClearedPosts.current = true;
    } else if (follows.length > 0) {
      hasClearedPosts.current = false;
    }
  }, [follows, clearPosts]);

  // Setup subscription for posts
  const setupSubscription = useCallback(async () => {
    console.log('🔍 DEBUG: setupSubscription called', { 
      ndk: !!ndk, 
      followsCount: follows.length,
      isAuthenticated,
      isConnected
    });
    
    // Clean up any existing subscription
    if (subscriptionRef.current) {
      console.log('🔄 DEBUG: Cleaning up existing subscription');
      subscriptionRef.current.stop();
      subscriptionRef.current = null;
    }

    // Clear processed events (limit size to prevent memory leaks)
    if (processedEvents.current.size > 1000) {
      processedEvents.current.clear();
    }
    console.log('🧹 DEBUG: Cleared processed events');

    // Only proceed if we have all requirements
    if (!ndk || follows.length === 0 || !isAuthenticated || !isConnected) {
      console.log('❌ DEBUG: Cannot setup subscription', { 
        hasNDK: !!ndk, 
        followsCount: follows.length,
        isAuthenticated,
        isConnected
      });
      return;
    }

    setIsLoadingPosts(true);

    try {
      // Create filter object explicitly
      const filter = {
        kinds: [30023],
        authors: follows
      };

      console.log('📡 DEBUG: Creating subscription with filter:', {
        kinds: filter.kinds,
        authorsCount: filter.authors.length,
        firstFewAuthors: filter.authors.slice(0, 3)
      });

      // Create new subscription with better configuration
      subscriptionRef.current = ndk.subscribe(
        filter,
        { 
          closeOnEose: true, // Changed to true for better reliability
          groupable: true // Changed to true for better performance
        },
        {
          onEvent: async (event) => {
            console.log('📨 DEBUG: Received event:', {
              id: event.id,
              pubkey: event.pubkey,
              kind: event.kind,
              created_at: event.created_at,
              title: getTagValue(event.tags, 'title') || 'Untitled'
            });
            
            // Skip if we've already processed this event
            if (processedEvents.current.has(event.id)) {
              console.log('⏭️ DEBUG: Skipping already processed event:', event.id);
              return;
            }
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

              console.log('✅ DEBUG: Adding post:', {
                id: post.id,
                title: post.title,
                author: post.pubkey,
                created_at: post.created_at
              });

              addPost(post);

              // Fetch profile if we haven't already
              const user = ndk.getUser({ pubkey: event.pubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                console.log('👤 DEBUG: Fetched profile for:', {
                  pubkey: event.pubkey,
                  name: profile.name,
                  displayName: profile.displayName
                });
                updateAuthorProfile(event.pubkey, {
                  name: profile.name,
                  displayName: profile.displayName
                });
              }
            } catch (error) {
              console.error('❌ DEBUG: Error processing blog post:', error);
            }
          },
          onEose: (subscription) => {
            console.log('🏁 DEBUG: Subscription reached EOSE:', subscription.internalId);
            setIsLoadingPosts(false);
          }
        }
      );
      
      console.log('✅ DEBUG: Subscription created successfully');
    } catch (error) {
      console.error('❌ DEBUG: Error setting up subscription:', error);
      setIsLoadingPosts(false);
    }
  }, [ndk, follows, isAuthenticated, isConnected, addPost, updateAuthorProfile]);

  // Set up the subscription when dependencies are ready
  useEffect(() => {
    if (follows.length > 0 && isAuthenticated && isConnected) {
      // Clear any existing timeout
      if (setupSubscriptionTimeoutRef.current) {
        clearTimeout(setupSubscriptionTimeoutRef.current);
      }
      
      // Add a small delay to ensure everything is properly initialized and prevent rapid re-setups
      setupSubscriptionTimeoutRef.current = setTimeout(() => {
        setupSubscription();
      }, 200);

      return () => {
        if (setupSubscriptionTimeoutRef.current) {
          clearTimeout(setupSubscriptionTimeoutRef.current);
        }
      };
    }
  }, [follows, isAuthenticated, isConnected, setupSubscription]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        console.log('🧹 DEBUG: Cleaning up subscription on unmount');
        subscriptionRef.current.stop();
        subscriptionRef.current = null;
      }
      if (setupSubscriptionTimeoutRef.current) {
        clearTimeout(setupSubscriptionTimeoutRef.current);
      }
    };
  }, []);

  if (isLoading || isLoadingFollows) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.emptyState}>
            Please login with Nostr to read longform content from people you follow.
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.emptyState}>
            Connecting to Nostr network... Please wait.
          </div>
        </div>
      </div>
    );
  }

  const sortedPosts = getSortedPosts();
  console.log('📊 DEBUG: All posts from context:', {
    totalPosts: sortedPosts.length,
    posts: sortedPosts.map(p => ({ id: p.id, title: p.title, pubkey: p.pubkey }))
  });
  
  const filteredPosts = sortedPosts
    .filter(post => follows.includes(post.pubkey)) // Only show posts from follows
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

  console.log('🔍 DEBUG: Filtered posts:', {
    followsCount: follows.length,
    filterType: filter,
    postsFromFollows: sortedPosts.filter(post => follows.includes(post.pubkey)).length,
    finalFilteredCount: filteredPosts.length,
    isLoadingPosts
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
          {isLoadingPosts && follows.length > 0 && (
            <div className={styles.loadingState}>
              Loading posts from {follows.length} people you follow...
            </div>
          )}
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {filteredPosts.length === 0 && !isLoadingPosts && (
            <div className={styles.emptyState}>
              {follows.length === 0 ? (
                <>
                  You don&apos;t follow anyone yet. Follow some people on Nostr to see their longform posts here!
                </>
              ) : filter === 'all' ? (
                "No blog posts found from people you follow."
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