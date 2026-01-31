'use client';

import { useState, useEffect, memo, useRef, useCallback, useMemo } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useBlog, BlogPost } from '@/contexts/BlogContext';
import toast from 'react-hot-toast';
import styles from './page.module.css';
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import NDK from '@nostr-dev-kit/ndk';
import { NDKSubscription } from '@nostr-dev-kit/ndk';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useRouter } from 'next/navigation';
import { generateNip05Url, getUserIdentifier } from '@/utils/nostr';
import { AuthGuard } from '@/components/AuthGuard';
import { CONTACT_LIST_RELAYS } from '@/config/relays';
import { getCachedFollows, cacheFollows } from '@/utils/storage';

function getTagValue(tags: string[][], tagName: string): string | undefined {
  return tags.find(tag => tag[0] === tagName)?.[1];
}

function getTagValues(tags: string[][], tagName: string): string[] {
  return tags.filter(tag => tag[0] === tagName).map(tag => tag[1]);
}

const PostCard = memo(({ post, onClick, onHover, ndk }: { post: BlogPost; onClick: (post: BlogPost) => void; onHover: (post: BlogPost) => void; ndk: NDK }) => {
  const { isPostRead, markPostAsRead, markPostAsUnread, getAuthorProfile } = useBlog();
  const x = useMotionValue(0);
  const controls = useAnimation();

  // Transform x position to opacity for the action indicators
  const leftOpacity = useTransform(x, [-30, -15], [1, 0]);
  const rightOpacity = useTransform(x, [15, 30], [0, 1]);
  
  // Transform x position to scale for the card
  const scale = useTransform(x, [-100, 0, 100], [0.98, 1, 0.98]);

  // Add haptic feedback if available
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  const handleDragEnd = useCallback(async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
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
  }, [controls, isPostRead, markPostAsRead, markPostAsUnread, post.id, vibrate]);

  // Memoize the read status to prevent unnecessary re-renders
  const isRead = useMemo(() => isPostRead(post.id), [isPostRead, post.id]);
  
  // Memoize the author display name - check both post.author and centralized cache
  const authorDisplay = useMemo(() => {
    // First check if we have author info in the post itself
    if (post.author?.displayName || post.author?.name) {
      return post.author.displayName || post.author.name;
    }
    
    // If not, check the centralized author profiles cache
    const cachedProfile = getAuthorProfile(post.pubkey);
    if (cachedProfile?.displayName || cachedProfile?.name) {
      return cachedProfile.displayName || cachedProfile.name;
    }
    
    // Fallback to truncated pubkey
    return post.pubkey.slice(0, 8) + '...';
  }, [post.author?.displayName, post.author?.name, post.pubkey, getAuthorProfile]);
  
  // Memoize the formatted date
  const formattedDate = useMemo(() => {
    return new Date(post.created_at * 1000).toLocaleDateString();
  }, [post.created_at]);

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
        className={`${styles.postCard} ${isRead ? styles.read : ''}`}
      >
        <a 
          href={`/reader/${post.pubkey}/${post.dTag || post.id.slice(0, 8)}`}
          onClick={async (e) => { 
            e.preventDefault(); 
            await onClick(post); 
          }} 
          onMouseEnter={(e) => { e.preventDefault(); onHover(post); }} 
          className={styles.postCardLink}
          onAuxClick={async (e) => {
            // Handle middle-click (button 1) to open in new tab
            if (e.button === 1) {
              e.preventDefault();
              try {
                // Generate URL directly without calling onClick
                const authorIdentifier = await getUserIdentifier(ndk, post.pubkey);
                const dTag = post.dTag || post.id.slice(0, 8);
                const url = generateNip05Url(authorIdentifier, dTag);
                window.open(url, '_blank');
              } catch (error) {
                console.error('Error opening in new tab:', error);
              }
            }
          }}
          onContextMenu={async (e) => {
            // Update href when right-clicking to get the correct URL for copying
            try {
              const authorIdentifier = await getUserIdentifier(ndk, post.pubkey);
              const dTag = post.dTag || post.id.slice(0, 8);
              const url = generateNip05Url(authorIdentifier, dTag);
              if (e.currentTarget) {
                e.currentTarget.href = url;
              }
            } catch (error) {
              console.error('Error updating href for context menu:', error);
            }
          }}
        >
          <div className={styles.readIndicator} />
          <div className={styles.postCardContent}>
            <div className={styles.postCardHeader}>
              <h2 className={styles.postCardTitle}>{post.title}</h2>
              <div className={styles.postCardMeta}>
                <span className={styles.postCardAuthor}>
                  {authorDisplay}
                </span>
                <div className={styles.postCardDate}>
                  <time>{formattedDate}</time>
                </div>
              </div>
            </div>
            {post.summary && (
              <p className={styles.postCardSummary}>{post.summary}</p>
            )}
          </div>
        </a>
      </motion.div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Note: We don't need to compare author profiles here because the memoized authorDisplay
  // will automatically update when the context's authorProfiles change
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.title === nextProps.post.title &&
    prevProps.post.summary === nextProps.post.summary &&
    prevProps.post.created_at === nextProps.post.created_at &&
    prevProps.post.author?.displayName === nextProps.post.author?.displayName &&
    prevProps.post.author?.name === nextProps.post.author?.name &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.onHover === nextProps.onHover &&
    prevProps.ndk === nextProps.ndk
  );
});

PostCard.displayName = 'PostCard';

// Error logging utility for mobile debugging
const logError = (error: Error, context: string) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'unknown'
  };
  
  // Log to console if available
  console.error('🚨 MOBILE ERROR:', errorInfo);
  
  // Store in localStorage for debugging
  try {
    const existingErrors = JSON.parse(localStorage.getItem('mobile-errors') || '[]');
    existingErrors.push(errorInfo);
    // Keep only last 10 errors
    if (existingErrors.length > 10) {
      existingErrors.splice(0, existingErrors.length - 10);
    }
    localStorage.setItem('mobile-errors', JSON.stringify(existingErrors));
  } catch (e) {
    console.error('Failed to save error to localStorage:', e);
  }
  
  // Show error in UI if possible
  if (typeof toast !== 'undefined') {
    toast.error(`Error: ${error.message}`);
  }
};

export default function ReaderPage() {
  // Add error boundary for the entire component
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logError(new Error(event.message), 'Global error handler');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logError(new Error(event.reason?.message || 'Unhandled promise rejection'), 'Unhandled promise rejection');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const { ndk, isLoading, isAuthenticated, isConnected } = useNostr();
  const { getSortedPosts, addPost, updateAuthorProfile, clearPosts, isPostRead, fetchProfileOnce } = useBlog();
  const router = useRouter();
  
  // Declare all state variables first
  const [follows, setFollows] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [isLoadingFollows, setIsLoadingFollows] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [postsToShow, setPostsToShow] = useState(21); // Track how many posts to display
  const [isNavigating, setIsNavigating] = useState(false); // Track navigation state
  
  // Now we can use the state variables in useMemo
  const sortedPosts = getSortedPosts();
  
  // Direct filtering and limiting - only process what we need
  const filteredPosts = useMemo(() => {
    // Only recalculate if we have posts and follows
    if (sortedPosts.length === 0 || follows.length === 0) {
      return [];
    }
    
    const postsFromFollows = sortedPosts.filter(post => follows.includes(post.pubkey));
    
    const filteredByReadStatus = postsFromFollows.filter(post => {
      switch (filter) {
        case 'read':
          return isPostRead(post.id);
        case 'unread':
          return !isPostRead(post.id);
        default:
          return true;
      }
    });
    
    // Only take the first postsToShow posts
    const limited = filteredByReadStatus.slice(0, postsToShow);
    
    return limited;
  }, [sortedPosts, follows, filter, isPostRead, postsToShow]);

  // Create columns for masonry layout
  const columns = useMemo(() => {
    const columnCount = typeof window !== 'undefined' 
      ? (window.innerWidth >= 1536 ? 4 : window.innerWidth >= 1280 ? 3 : window.innerWidth >= 768 ? 2 : 1)
      : 1;
    
    if (columnCount === 1) {
      return [filteredPosts];
    }
    
    const cols: BlogPost[][] = Array.from({ length: columnCount }, () => []);
    
    filteredPosts.forEach((post, index) => {
      const columnIndex = index % columnCount;
      cols[columnIndex].push(post);
    });
    
    return cols;
  }, [filteredPosts]);
  
  // Calculate total available for load more button (separate from rendering)
  const totalAvailablePosts = useMemo(() => {
    const postsFromFollows = sortedPosts.filter(post => follows.includes(post.pubkey));
    return postsFromFollows.filter(post => {
      switch (filter) {
        case 'read':
          return isPostRead(post.id);
        case 'unread':
          return !isPostRead(post.id);
        default:
          return true;
      }
    });
  }, [sortedPosts, follows, filter, isPostRead]);

  const processedEvents = useRef(new Map<string, number>()); // Map of eventId -> timestamp
  const hasClearedPosts = useRef(false);
  const subscriptionRef = useRef<NDKSubscription | null>(null);
  const setupSubscriptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventCountRef = useRef(0);
  const lastSetupTimeRef = useRef(0);
  const subscriptionStateRef = useRef<'idle' | 'setting_up' | 'active' | 'stopping'>('idle');

  const fetchFollows = useCallback(async () => {
    if (isNavigating) return;
    if (!ndk || !isAuthenticated || !isConnected || isLoading) {
      setFollows([]);
      return;
    }

    setIsLoadingFollows(true);
    
    try {
      // Get current user
      const user = await ndk.signer?.user();
      
      if (isNavigating) return;

      if (!user?.pubkey) {
        setFollows([]);
        return;
      }

      // Restore cached follows immediately so we can show cached posts while fetching
      const cached = getCachedFollows(user.pubkey);
      if (cached?.length) {
        setFollows(cached);
      }

      const fetchFromRelay = async (relayUrl: string) => {
        if (isNavigating) return null;
        try {
          const events = await ndk.fetchEvents({
            kinds: [3],
            authors: [user.pubkey],
            limit: 1
          }, {
            relayUrls: [relayUrl]
          });
          
          if (isNavigating) return null;

          if (events.size > 0) {
            const event = Array.from(events)[0];
            return event;
          }
          return null;
        } catch {
          return null;
        }
      };

      const trustedRelays = CONTACT_LIST_RELAYS;
      const relayResults = await Promise.all(
        trustedRelays.map(async (relay) => {
          const event = await fetchFromRelay(relay);
          return { relay, event };
        })
      );

      if (isNavigating) return;

      // Find the most recent contact list from all relays
      const validResults = relayResults.filter(result => result.event !== null);
      
      if (validResults.length > 0) {
        validResults.sort((a, b) => b.event!.created_at - a.event!.created_at);
        const mostRecent = validResults[0];
        const followPubkeys = mostRecent.event!.tags
          .filter(tag => tag[0] === 'p')
          .map(tag => tag[1])
          .filter(Boolean);

        const cleanedFollows = followPubkeys.filter(pubkey => /^[0-9a-f]{64}$/i.test(pubkey));
        setFollows(cleanedFollows);
        cacheFollows(user.pubkey, cleanedFollows);
      } else {
        setFollows([]);
        cacheFollows(user.pubkey, []);
      }
    } catch {
      setFollows([]);
    } finally {
      setIsLoadingFollows(false);
    }
  }, [ndk, isAuthenticated, isConnected, isLoading, isNavigating]);

  // Fetch follows when authentication status changes
  useEffect(() => {
    if (isAuthenticated && isConnected && !isLoading) {
      fetchFollows();
    } else if (!isAuthenticated || !isConnected) {
      // Only clear follows when we're actually not authenticated or connected
      setFollows([]);
    }
  }, [isAuthenticated, isConnected, isLoading, fetchFollows]);

  // Clear posts and processed events when follows change
  useEffect(() => {
    if (follows.length === 0 && !hasClearedPosts.current) {
      clearPosts();
      hasClearedPosts.current = true;
    } else if (follows.length > 0) {
      hasClearedPosts.current = false;
    }
    
    processedEvents.current.clear();
  }, [follows, clearPosts]);

  // Reset postsToShow when filter changes
  useEffect(() => {
    setPostsToShow(21);
  }, [filter]);

  const setupSubscription = useCallback(async () => {
    if (isNavigating) return;
    if (subscriptionStateRef.current === 'setting_up' || subscriptionStateRef.current === 'active') return;
    const now = Date.now();
    const timeSinceLastSetup = now - lastSetupTimeRef.current;
    if (timeSinceLastSetup < 1000) return;
    lastSetupTimeRef.current = now;
    subscriptionStateRef.current = 'setting_up';
    if (subscriptionRef.current) {
      subscriptionStateRef.current = 'stopping';
      subscriptionRef.current.stop();
      subscriptionRef.current = null;
      subscriptionStateRef.current = 'idle';
    }
    eventCountRef.current = 0;

    if (!ndk || follows.length === 0 || !isAuthenticated || !isConnected) {
      subscriptionStateRef.current = 'idle';
      return;
    }
    setIsLoadingPosts(true);
    loadingTimeoutRef.current = setTimeout(() => {
      setIsLoadingPosts(false);
    }, 10000);

    try {
      // Create filter object explicitly - support multiple longform kinds
      const filter = {
        kinds: [30023], // 30023 is the standard longform kind
        authors: follows
      };

      subscriptionRef.current = ndk.subscribe(
        filter,
        { 
          closeOnEose: false, // Changed to false to keep subscription open for new posts
          groupable: false // Disable grouping to send subscription immediately
        },
        {
          onEvent: async (event) => {
            if (isNavigating) return;
            if (processedEvents.current.has(event.id)) return;
            processedEvents.current.set(event.id, Date.now());

            // Increment event counter
            eventCountRef.current++;
            
            // Clear the loading timeout since we received an event
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            
            if (eventCountRef.current >= 5) {
              setIsLoadingPosts(false);
            }

            try {
              const title = getTagValue(event.tags, 'title') || 'Untitled';
              const summary = getTagValue(event.tags, 'summary') || '';
              const published_at = parseInt(getTagValue(event.tags, 'published_at') || event.created_at.toString());
              const image = getTagValue(event.tags, 'image');
              const tags = getTagValues(event.tags, 't');
              const dTag = getTagValue(event.tags, 'd'); // Extract d tag
              const client = getTagValue(event.tags, 'client'); // Extract client tag

              const post: BlogPost = {
                id: event.id,
                pubkey: event.pubkey,
                created_at: event.created_at,
                content: event.content,
                title,
                summary,
                published_at,
                image,
                tags,
                dTag,
                client
              };
              addPost(post);
              if (!isNavigating) {
                fetchProfileOnce(event.pubkey, async () => {
                  const user = ndk.getUser({ pubkey: event.pubkey });
                  const profile = await user.fetchProfile();
                  if (profile) {
                    return {
                      name: profile.name,
                      displayName: profile.displayName,
                      nip05: profile.nip05,
                      image: profile.image,
                      picture: profile.picture
                    };
                  }
                  return null;
                });
              }
            } catch {
              // Skip malformed event
            }
          },
          onEose: () => {
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            setIsLoadingPosts(false);
          }
        }
      );
      subscriptionStateRef.current = 'active';
    } catch {
      subscriptionStateRef.current = 'idle';
      // Clear the loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setIsLoadingPosts(false);
    }
  }, [ndk, follows, isAuthenticated, isConnected, addPost, updateAuthorProfile, getSortedPosts, isLoading, isNavigating, fetchProfileOnce]);

  // Set up the subscription when dependencies are ready
  useEffect(() => {
    // Defer subscription setup to prevent blocking navigation
    const timeoutId = setTimeout(() => {
      if (follows.length > 0 && isAuthenticated && isConnected && !isLoading) {
        setupSubscription();
      }
    }, 100); // Small delay to prioritize navigation

    return () => clearTimeout(timeoutId);
  }, [follows, isAuthenticated, isConnected, isLoading, setupSubscription]);

  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionStateRef.current = 'stopping';
        subscriptionRef.current.stop();
        subscriptionRef.current = null;
        subscriptionStateRef.current = 'idle';
      }
      const timeoutRef = setupSubscriptionTimeoutRef.current;
      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Reset navigation state when returning to reader page
  useEffect(() => {
    const handleRouteChange = () => {
      if (window.location.pathname === '/reader') setIsNavigating(false);
    };

    // Check current route on mount
    handleRouteChange();

    // Listen for route changes
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  const handleCardClick = useCallback(async (post: BlogPost) => {
    setIsNavigating(true);
    
    try {
      // Get the best identifier for the author
      const authorIdentifier = await getUserIdentifier(ndk, post.pubkey);
      
      // Use the d tag from the post if available, otherwise fallback to event ID
      const dTag = post.dTag || post.id.slice(0, 8);
      
      const url = generateNip05Url(authorIdentifier, dTag);
      router.push(url);
    } catch (error) {
      console.error('Error generating URL:', error);
      // Fallback to home page if we can't generate the URL
      router.push('/');
    }
  }, [router, setIsNavigating, ndk]);

  const handleCardHover = useCallback(async (post: BlogPost) => {
    try {
      // Get the best identifier for the author
      const authorIdentifier = await getUserIdentifier(ndk, post.pubkey);
      
      // Use the d tag from the post if available, otherwise fallback to event ID
      const dTag = post.dTag || post.id.slice(0, 8);
      
      const url = generateNip05Url(authorIdentifier, dTag);
      router.prefetch(url);
    } catch (error) {
      console.error('Error prefetching URL:', error);
      // Skip prefetching if we can't generate the URL
    }
  }, [router, ndk]);

  // Add error handling for the main render logic
  try {

    return (
      <AuthGuard requireConnection={true}>
        <ErrorBoundary>
          {follows.length === 0 && (isLoadingFollows || isLoading || !isConnected || !isAuthenticated) ? (
            <div className={styles.container}>
              <div className={styles.content}>
                <div className="loading-content">
                  <div className="loading-spinner"></div>
                  <p className="loading-text">Loading your reads...</p>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.container}>
            <div className={styles.content}>
              {(isLoadingFollows || isLoadingPosts) && (
                <div className={styles.updatingBanner} role="status" aria-live="polite">
                  Updating…
                </div>
              )}
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
               {filteredPosts.length === 0 && follows.length === 0 ? (
                 <div className={styles.emptyState}>
                   You don&apos;t follow anyone yet. Follow some people on Nostr to see their longform posts here!
                 </div>
               ) : filteredPosts.length === 0 && follows.length > 0 ? (
                 <div className={styles.emptyState}>
                   {filter === 'all' ? (
                     "No blog posts found from people you follow."
                   ) : filter === 'read' ? (
                     "No read posts found."
                   ) : (
                     "No unread posts found."
                   )}
                 </div>
               ) : (
                 columns.map((column, columnIndex) => (
                   <div key={`${columnIndex}-${column.length}`} className={styles.column}>
                     {column.map((post) => (
                       <PostCard key={post.id} post={post} onClick={handleCardClick} onHover={handleCardHover} ndk={ndk} />
                     ))}
                   </div>
                 ))
               )}
             </div>
            
            {/* Bottom controls row */}
            {filteredPosts.length > 0 && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                borderTop: '1px solid rgb(39, 39, 42)',
                background: 'rgba(0, 0, 0, 0.3)',
                marginTop: '0'
              }}>
                {filteredPosts.length === postsToShow && (
                  <div style={{
                    padding: '10px',
                    background: 'rgba(161, 161, 170, 0.1)',
                    border: '1px solid rgb(39, 39, 42)',
                    borderRadius: '4px',
                    margin: '0 0 15px 0',
                    fontSize: '14px',
                    color: 'rgb(161, 161, 170)',
                    textAlign: 'center'
                  }}>
                    Showing {postsToShow} / {totalAvailablePosts.length} articles
                  </div>
                )}
                
                {/* Load More Button */}
                {totalAvailablePosts.length > postsToShow && (
                  <button
                    onClick={() => setPostsToShow(prev => prev + 21)}
                    style={{
                      padding: '0.625rem 1.25rem',
                      background: '#ffffff',
                      color: '#000000',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#f4f4f5';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Load More
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
          )}
        </ErrorBoundary>
      </AuthGuard>
    );
  } catch (error) {
    // Log the error and show a user-friendly error message
    logError(error as Error, 'Render error');
    setRenderError((error as Error).message);
    
    return (
      <AuthGuard requireConnection={true}>
        <ErrorBoundary>
          <div className={styles.container}>
            <div className={styles.content}>
              <div style={{ 
                padding: '20px', 
                background: '#fee', 
                border: '1px solid #fcc', 
                borderRadius: '8px',
                margin: '20px 0'
              }}>
                <h2>Something went wrong</h2>
                <p>An error occurred while loading the page. Please try refreshing.</p>
                <p><strong>Error:</strong> {renderError}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  style={{
                    padding: '10px 20px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </AuthGuard>
    );
  }
} 