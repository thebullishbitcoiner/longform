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

  // Debug log to track rendering - only log once per render cycle
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  
  if (renderCountRef.current === 1) {
    console.log('🎯 DEBUG: PostCard rendering:', { id: post.id, title: post.title, renderCount: renderCountRef.current });
  }

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
                console.log('🔗 Opening in new tab:', url);
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
              e.currentTarget.href = url;
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
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [showDebugConsole, setShowDebugConsole] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [postsToShow, setPostsToShow] = useState(21); // Track how many posts to display
  const [isNavigating, setIsNavigating] = useState(false); // Track navigation state
  const [debouncedFilteredPosts, setDebouncedFilteredPosts] = useState<BlogPost[]>([]);
  
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
    
    console.log('🔍 DEBUG: Filtered posts calculation:', {
      totalPosts: sortedPosts.length,
      fromFollows: postsFromFollows.length,
      afterFilter: filteredByReadStatus.length,
      postsToShow,
      actualRendered: limited.length,
      firstFewIds: limited.slice(0, 3).map(p => p.id)
    });
    
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

  // Fetch current user's follows (contact list)
  const fetchFollows = useCallback(async () => {
    console.log('🔍 DEBUG: fetchFollows called', { 
      ndk: !!ndk, 
      isAuthenticated, 
      isConnected,
      isLoading,
      isNavigating
    });
    
    // Stop if we're navigating away
    if (isNavigating) {
      console.log('⏹️ DEBUG: Stopping fetchFollows - navigating away');
      return;
    }
    
    setDebugInfo('Fetching follows...');
    
    if (!ndk || !isAuthenticated || !isConnected || isLoading) {
      console.log('❌ DEBUG: Cannot fetch follows - missing requirements');
      setFollows([]);
      return;
    }

    setIsLoadingFollows(true);
    
    try {
      // Get current user
      const user = await ndk.signer?.user();
      
      // Check navigation state again after async operation
      if (isNavigating) {
        console.log('⏹️ DEBUG: Stopping fetchFollows - navigating away after user fetch');
        return;
      }
      
      console.log('👤 DEBUG: Current user:', user ? { pubkey: user.pubkey, npub: user.npub } : 'null');
      
      if (!user?.pubkey) {
        console.log('❌ DEBUG: No authenticated user found');
        setFollows([]);
        return;
      }

      console.log('🔍 DEBUG: Fetching follows for user:', user.pubkey);

      // Function to fetch contact list from a specific relay
      const fetchFromRelay = async (relayUrl: string) => {
        // Check navigation state before each relay query
        if (isNavigating) {
          console.log('⏹️ DEBUG: Stopping relay query - navigating away');
          return null;
        }
        
        try {
          console.log(`📡 DEBUG: Querying relay: ${relayUrl}`);
          const events = await ndk.fetchEvents({
            kinds: [3],
            authors: [user.pubkey],
            limit: 1
          }, {
            relayUrls: [relayUrl]
          });
          
          // Check navigation state after async operation
          if (isNavigating) {
            console.log('⏹️ DEBUG: Stopping relay query - navigating away after fetch');
            return null;
          }
          
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

      // Check navigation state before processing results
      if (isNavigating) {
        console.log('⏹️ DEBUG: Stopping fetchFollows - navigating away before processing results');
        return;
      }

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
        
        // Clean the follows list to remove invalid pubkeys
        const cleanedFollows = followPubkeys.filter(pubkey => /^[0-9a-f]{64}$/i.test(pubkey));
        const invalidFollows = followPubkeys.filter(pubkey => !/^[0-9a-f]{64}$/i.test(pubkey));
        
        if (invalidFollows.length > 0) {
          console.log('⚠️ DEBUG: Found invalid follows:', invalidFollows);
          setDebugInfo(`Cleaned follows: ${cleanedFollows.length} valid, ${invalidFollows.length} invalid removed`);
        } else {
          setDebugInfo(`Found ${cleanedFollows.length} follows from ${mostRecent.relay}`);
        }
        
        setFollows(cleanedFollows);
      } else {
        console.log('❌ DEBUG: No contact list found on any relay');
        setFollows([]);
        setDebugInfo('No contact list found on any relay');
      }
    } catch (error) {
      console.error('❌ DEBUG: Error fetching follows:', error);
      setFollows([]);
      setDebugInfo(`Error fetching follows: ${error}`);
    } finally {
      setIsLoadingFollows(false);
    }
  }, [ndk, isAuthenticated, isConnected, isLoading, isNavigating]);

  // Fetch follows when authentication status changes
  useEffect(() => {
    if (isAuthenticated && isConnected && !isLoading) {
      // Defer follows fetching to prevent blocking navigation
      const timeoutId = setTimeout(() => {
        fetchFollows();
      }, 50); // Small delay to prioritize navigation
      
      return () => clearTimeout(timeoutId);
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
    
    // Clear processed events when follows change to avoid processing old events
    processedEvents.current.clear();
    console.log('🧹 DEBUG: Cleared processed events due to follows change');
  }, [follows, clearPosts]);

  // Reset postsToShow when filter changes
  useEffect(() => {
    setPostsToShow(21);
  }, [filter]);

  // Debounce filteredPosts to prevent rapid re-renders
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedFilteredPosts(filteredPosts);
    }, 100); // 100ms debounce

    return () => clearTimeout(timeoutId);
  }, [filteredPosts]);

  // Setup subscription for posts
  const setupSubscription = useCallback(async () => {
    console.log('🔍 DEBUG: setupSubscription called', { 
      ndk: !!ndk, 
      followsCount: follows.length,
      isAuthenticated,
      isConnected,
      isLoading,
      subscriptionState: subscriptionStateRef.current,
      isNavigating
    });
    
    // Stop if we're navigating away
    if (isNavigating) {
      console.log('⏹️ DEBUG: Stopping setupSubscription - navigating away');
      return;
    }
    
    // Prevent multiple simultaneous subscription setups
    if (subscriptionStateRef.current === 'setting_up' || subscriptionStateRef.current === 'active') {
      console.log('⏸️ DEBUG: Skipping subscription setup - already in progress or active');
      return;
    }
    
    // Debounce rapid subscription setups
    const now = Date.now();
    const timeSinceLastSetup = now - lastSetupTimeRef.current;
    if (timeSinceLastSetup < 1000) { // Minimum 1 second between setups
      console.log('⏰ DEBUG: Skipping subscription setup - too soon since last setup:', timeSinceLastSetup + 'ms');
      return;
    }
    lastSetupTimeRef.current = now;
    
    subscriptionStateRef.current = 'setting_up';
    setDebugInfo('Setting up subscription...');
    
    // Clean up any existing subscription
    if (subscriptionRef.current) {
      console.log('🔄 DEBUG: Cleaning up existing subscription:', subscriptionRef.current.internalId);
      subscriptionStateRef.current = 'stopping';
      subscriptionRef.current.stop();
      subscriptionRef.current = null;
      subscriptionStateRef.current = 'idle';
    }
    
    // Don't clear processed events here - only clear when follows change
    console.log('🧹 DEBUG: Setup subscription - processed events count:', processedEvents.current.size);
    
    // Reset event counter
    eventCountRef.current = 0;

    // Only proceed if we have all requirements
    if (!ndk || follows.length === 0 || !isAuthenticated || !isConnected) {
      console.log('❌ DEBUG: Cannot setup subscription', { 
        hasNDK: !!ndk, 
        followsCount: follows.length,
        isAuthenticated,
        isConnected
      });
      setDebugInfo(`Cannot setup subscription: hasNDK=${!!ndk}, follows=${follows.length}, auth=${isAuthenticated}, connected=${isConnected}`);
      subscriptionStateRef.current = 'idle';
      return;
    }

    // Check if we already have posts from follows
    const existingPosts = getSortedPosts().filter(post => follows.includes(post.pubkey));
    console.log('🔍 DEBUG: Existing posts from follows:', {
      existingCount: existingPosts.length,
      followsCount: follows.length,
      allPostsCount: getSortedPosts().length
    });
    
    // Don't skip loading if we have existing posts - we want to keep the subscription open for new posts
    // Note: Removed the isLoadingPosts check as it was preventing subscription creation

    setIsLoadingPosts(true);

    // Set a fallback timeout to stop loading after 10 seconds
    loadingTimeoutRef.current = setTimeout(() => {
      console.log('⏰ DEBUG: Loading timeout reached, stopping loading state');
      setIsLoadingPosts(false);
      setDebugInfo('Loading timeout reached - no events received');
    }, 10000);

    try {
      // Create filter object explicitly - support multiple longform kinds
      const filter = {
        kinds: [30023], // 30023 is the standard longform kind
        authors: follows
      };

      console.log('📡 DEBUG: Creating subscription with filter:', {
        kinds: filter.kinds,
        authorsCount: filter.authors.length,
        firstFewAuthors: filter.authors.slice(0, 3),
        allFollows: follows,
        filterObject: filter
      });
      
      // Log the exact filter being sent to NDK
      console.log('🔍 DEBUG: NDK subscription filter:', JSON.stringify(filter, null, 2));

      // Create new subscription with better configuration
      console.log('📡 DEBUG: About to create subscription with NDK...');
      subscriptionRef.current = ndk.subscribe(
        filter,
        { 
          closeOnEose: false, // Changed to false to keep subscription open for new posts
          groupable: false // Disable grouping to send subscription immediately
        },
        {
          onEvent: async (event) => {
            // Check navigation state before processing each event
            if (isNavigating) {
              console.log('⏹️ DEBUG: Skipping event processing - navigating away');
              return;
            }
            
            console.log('📨 DEBUG: Received event:', {
              id: event.id,
              pubkey: event.pubkey,
              kind: event.kind,
              created_at: event.created_at,
              title: getTagValue(event.tags, 'title') || 'Untitled',
              isFromFollow: follows.includes(event.pubkey),
              followIndex: follows.indexOf(event.pubkey)
            });
            
            // Skip if we've already processed this event
            if (processedEvents.current.has(event.id)) {
              const lastProcessed = processedEvents.current.get(event.id);
              const timeSinceLastProcessed = Date.now() - (lastProcessed || 0);
              console.log('⏭️ DEBUG: Skipping already processed event:', {
                id: event.id,
                timeSinceLastProcessed: timeSinceLastProcessed + 'ms',
                processedEventsCount: processedEvents.current.size
              });
              return;
            }
            processedEvents.current.set(event.id, Date.now());

            // Increment event counter
            eventCountRef.current++;
            
            // Clear the loading timeout since we received an event
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            
            // If we've received some events, stop loading after a shorter timeout
            if (eventCountRef.current >= 5) {
              console.log('✅ DEBUG: Received sufficient events, stopping loading state');
              setIsLoadingPosts(false);
              setDebugInfo(`Received ${eventCountRef.current} events, stopped loading`);
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

              console.log('✅ DEBUG: Adding post:', {
                id: post.id,
                title: post.title,
                author: post.pubkey,
                created_at: post.created_at
              });

              addPost(post);

              // Fetch profile if we haven't already - but check navigation state first
              if (!isNavigating) {
                // Use the centralized profile fetching to prevent duplicates
                fetchProfileOnce(event.pubkey, async () => {
                  const user = ndk.getUser({ pubkey: event.pubkey });
                  const profile = await user.fetchProfile();
                  if (profile) {
                    console.log('👤 DEBUG: Fetched profile for:', {
                      pubkey: event.pubkey,
                      name: profile.name,
                      displayName: profile.displayName
                    });
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
            } catch (error) {
              console.error('❌ DEBUG: Error processing blog post:', error);
            }
          },
          onEose: (subscription) => {
            console.log('🏁 DEBUG: Subscription reached EOSE:', subscription.internalId);
            // Clear the loading timeout
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            setIsLoadingPosts(false);
          }
        }
      );
      
      console.log('✅ DEBUG: Subscription created successfully:', {
        subscriptionId: subscriptionRef.current?.internalId,
        hasSubscription: !!subscriptionRef.current
      });
      
      // Log subscription creation for debugging
      console.log('🔄 DEBUG: Subscription created:', subscriptionRef.current?.internalId);
      subscriptionStateRef.current = 'active';
      
      // Also try to fetch some recent events from follows to debug
      console.log('🔍 DEBUG: Testing fetchEvents for debugging...');
      
      // Test 1: Fetch any recent longform posts (not just from follows)
      ndk.fetchEvents({
        kinds: [30023],
        limit: 5
      }).then(events => {
        if (!isNavigating) {
          console.log('🔍 DEBUG: Any longform posts test:', {
            eventsCount: events.size,
            events: Array.from(events).map(e => ({
              id: e.id,
              kind: e.kind,
              pubkey: e.pubkey,
              created_at: e.created_at,
              title: getTagValue(e.tags, 'title') || 'No title'
            }))
          });
        }
      }).catch(error => {
        console.error('❌ DEBUG: Any longform posts test failed:', error);
      });
      
      // Test 2: Fetch events from follows (including regular notes)
      ndk.fetchEvents({
        kinds: [30023, 1], // Include regular notes too for debugging
        authors: follows.slice(0, 5), // Test with first 5 follows
        limit: 10
      }).then(events => {
        if (!isNavigating) {
          console.log('🔍 DEBUG: Follows events test result:', {
            eventsCount: events.size,
            events: Array.from(events).map(e => ({
              id: e.id,
              kind: e.kind,
              pubkey: e.pubkey,
              created_at: e.created_at,
              title: getTagValue(e.tags, 'title') || 'No title'
            }))
          });
        }
      }).catch(error => {
        console.error('❌ DEBUG: Follows events test failed:', error);
      });
      
    } catch (error) {
      console.error('❌ DEBUG: Error setting up subscription:', error);
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

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        console.log('🧹 DEBUG: Cleaning up subscription on unmount:', subscriptionRef.current.internalId);
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
      if (window.location.pathname === '/reader') {
        console.log('🔄 DEBUG: Returning to reader page, resetting navigation state');
        setIsNavigating(false);
      }
    };

    // Check current route on mount
    handleRouteChange();

    // Listen for route changes
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Monitor filteredPosts to ensure it's properly limited
  useEffect(() => {
    console.log('📊 DEBUG: filteredPosts changed:', {
      length: filteredPosts.length,
      postsToShow,
      isLimited: filteredPosts.length <= postsToShow,
      firstFew: filteredPosts.slice(0, 3).map(p => ({ id: p.id, title: p.title }))
    });
  }, [filteredPosts, postsToShow]);

  const handleCardClick = useCallback(async (post: BlogPost) => {
    setIsNavigating(true);
    
    try {
      // Get the best identifier for the author
      const authorIdentifier = await getUserIdentifier(ndk, post.pubkey);
      
      // Use the d tag from the post if available, otherwise fallback to event ID
      const dTag = post.dTag || post.id.slice(0, 8);
      
      const url = generateNip05Url(authorIdentifier, dTag);
      console.log('🔗 Regular click - navigating to:', url);
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
    console.log('🔍 DEBUG: Filtered posts:', {
      followsCount: follows.length,
      filterType: filter,
      postsFromFollows: sortedPosts.filter(post => follows.includes(post.pubkey)).length,
      finalFilteredCount: filteredPosts.length,
      isLoadingPosts
    });

    return (
      <AuthGuard requireConnection={true}>
        <ErrorBoundary>
          {isLoading || isLoadingFollows || isLoadingPosts || (subscriptionStateRef.current as string) === 'setting_up' || follows.length === 0 || debouncedFilteredPosts.length === 0 ? (
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
              <div className={styles.header}>
                <h1 className={styles.title}>Reads</h1>
                <div className={styles.filterButtons}>
                {process.env.NODE_ENV !== 'production' && (
                  <>
                    <button
                      onClick={() => setShowDebugConsole(!showDebugConsole)}
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(0, 0, 0, 0.1)',
                        color: '#666',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        marginRight: '10px'
                      }}
                      title="Toggle Debug Console"
                    >
                      🔧
                    </button>
                    {/* Quick Debug Buttons */}
                    <button
                      onClick={() => {
                        const allPosts = getSortedPosts();
                        const postsFromFollows = allPosts.filter(post => follows.includes(post.pubkey));
                        setDebugInfo(`Posts: Total=${allPosts.length}, From follows=${postsFromFollows.length}, Filtered=${totalAvailablePosts.length}, Displayed=${filteredPosts.length}, Limit=${postsToShow}`);
                        console.log('Quick debug:', { allPosts: allPosts.length, fromFollows: postsFromFollows.length, filtered: totalAvailablePosts.length, displayed: filteredPosts.length, limit: postsToShow });
                      }}
                      style={{
                        padding: '4px 8px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        marginRight: '10px'
                      }}
                      title="Count Posts"
                    >
                      📊
                    </button>
                    <button
                      onClick={() => {
                        console.log('🔍 DEBUG: Current state:', {
                          filteredPostsLength: filteredPosts.length,
                          postsToShow,
                          firstFew: filteredPosts.slice(0, 3).map(p => ({ id: p.id, title: p.title }))
                        });
                        setDebugInfo(`Rendering: ${filteredPosts.length} posts (limit: ${postsToShow})`);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        marginRight: '10px'
                      }}
                      title="Check Rendering"
                    >
                      🎨
                    </button>
                    <button
                      onClick={() => {
                        const allPosts = getSortedPosts();
                        const uniqueIds = new Set(allPosts.map(p => p.id));
                        setDebugInfo(`Raw: Total=${allPosts.length}, Unique=${uniqueIds.size}, Duplicates=${allPosts.length - uniqueIds.size}`);
                        console.log('Raw posts analysis:', { total: allPosts.length, unique: uniqueIds.size, duplicates: allPosts.length - uniqueIds.size });
                      }}
                      style={{
                        padding: '4px 8px',
                        background: '#fd7e14',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        marginRight: '10px'
                      }}
                      title="Check Duplicates"
                    >
                      🔍
                    </button>
                  </>
                )}
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
            {/* Debug Buttons - Only Visible in Development */}
            {process.env.NODE_ENV !== 'production' && (
              <div style={{ 
                background: '#f8f9fa',
                padding: '15px', 
                margin: '15px 0', 
                borderRadius: '8px', 
                border: '2px solid #dee2e6',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: '10px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  color: '#495057'
                }}>
                  <span style={{ marginRight: '10px' }}>🔍</span>
                  Debug Tools
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '10px'
                }}>
                  <button 
                    onClick={() => {
                      const allPosts = getSortedPosts();
                      const postsFromFollows = allPosts.filter(post => follows.includes(post.pubkey));
                      const info = `Posts: Total=${allPosts.length}, From follows=${postsFromFollows.length}, Filtered=${totalAvailablePosts.length}, Displayed=${filteredPosts.length}, Limit=${postsToShow}`;
                      setDebugInfo(info);
                      console.log('Quick debug:', { allPosts: allPosts.length, fromFollows: postsFromFollows.length, filtered: totalAvailablePosts.length, displayed: filteredPosts.length, limit: postsToShow });
                      toast(info); // Force display
                    }}
                    style={{
                      padding: '10px 15px',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                  >
                    📊 Count Posts
                  </button>
                  <button 
                    onClick={() => {
                      const info = `Rendering: ${filteredPosts.length} posts (limit: ${postsToShow})`;
                      console.log('🔍 DEBUG: Current state:', {
                        filteredPostsLength: filteredPosts.length,
                        postsToShow,
                        firstFew: filteredPosts.slice(0, 3).map(p => ({ id: p.id, title: p.title }))
                      });
                      setDebugInfo(info);
                      toast(info); // Force display
                    }}
                    style={{
                      padding: '10px 15px',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                  >
                    🎨 Check Rendering
                  </button>
                  <button 
                    onClick={() => {
                      const allPosts = getSortedPosts();
                      const uniqueIds = new Set(allPosts.map(p => p.id));
                      const info = `Raw: Total=${allPosts.length}, Unique=${uniqueIds.size}, Duplicates=${allPosts.length - uniqueIds.size}`;
                      setDebugInfo(info);
                      console.log('Raw posts analysis:', { total: allPosts.length, unique: uniqueIds.size, duplicates: allPosts.length - uniqueIds.size });
                      toast(info); // Force display
                    }}
                    style={{
                      padding: '10px 15px',
                      background: '#fd7e14',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                  >
                    🔍 Check Duplicates
                  </button>
                </div>
                {debugInfo && (
                  <div style={{ 
                    background: '#e9ecef', 
                    padding: '10px', 
                    borderRadius: '6px',
                    marginTop: '10px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: '#495057',
                    border: '1px solid #ced4da'
                  }}>
                    <strong>Debug Info:</strong> {debugInfo}
                  </div>
                )}
              </div>
            )}
            {showDebugConsole && (
              <div style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                padding: '20px', 
                margin: '20px 0', 
                borderRadius: '12px', 
                fontSize: '14px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: '15px',
                  fontSize: '16px',
                  fontWeight: '600'
                }}>
                  <span style={{ 
                    background: 'rgba(255, 255, 255, 0.2)', 
                    padding: '4px 8px', 
                    borderRadius: '6px',
                    marginRight: '10px',
                    fontSize: '12px'
                  }}>
                    🔍
                  </span>
                  Debug Console
                </div>
                <div style={{ 
                  background: 'rgba(0, 0, 0, 0.2)', 
                  padding: '12px', 
                  borderRadius: '8px',
                  marginBottom: '15px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  {debugInfo}
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '10px'
                }}>
                  <button 
                    onClick={() => {
                      setDebugInfo('Checking subscription status...');
                      const status = {
                        hasSubscription: !!subscriptionRef.current,
                        subscriptionId: subscriptionRef.current?.internalId,
                        subscriptionState: subscriptionStateRef.current,
                        isLoadingPosts,
                        eventCount: eventCountRef.current,
                        processedEventsCount: processedEvents.current.size,
                        followsCount: follows.length,
                        isAuthenticated,
                        isConnected
                      };
                      setDebugInfo(`Subscription status: ${JSON.stringify(status, null, 2)}`);
                      console.log('Subscription status:', status);
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #fd7e14 0%, #e55a00 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      transition: 'all 0.2s ease',
                      minWidth: '120px'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    📊 Check Status
                  </button>
                  <button 
                                          onClick={() => {
                        const allPosts = getSortedPosts();
                        const postsFromFollows = allPosts.filter(post => follows.includes(post.pubkey));
                        
                        setDebugInfo(`Post counts: Total=${allPosts.length}, From follows=${postsFromFollows.length}, Filtered=${totalAvailablePosts.length}, Displayed=${filteredPosts.length} (limited to ${postsToShow})`);
                        console.log('Post count info:', {
                          total: allPosts.length,
                          fromFollows: postsFromFollows.length,
                          filtered: totalAvailablePosts.length,
                          displayed: filteredPosts.length,
                          limit: postsToShow
                        });
                      }}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      transition: 'all 0.2s ease',
                      minWidth: '120px'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    📊 Post Counts
                  </button>
                  <button 
                    onClick={() => {
                      const hasMorePosts = totalAvailablePosts.length > postsToShow;
                      
                      setDebugInfo(`Load More Status: Showing ${postsToShow}/${totalAvailablePosts.length} posts. Has more: ${hasMorePosts}. Filter: ${filter}`);
                      console.log('Load more status:', {
                        showing: postsToShow,
                        total: totalAvailablePosts.length,
                        hasMore: hasMorePosts,
                        filter
                      });
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      transition: 'all 0.2s ease',
                      minWidth: '120px'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    📄 Load More Status
                  </button>
                  <button 
                    onClick={() => {
                      console.log('🔍 DEBUG: Current posts state:', {
                        allPosts: getSortedPosts().length,
                        totalAvailable: totalAvailablePosts.length,
                        filteredPosts: filteredPosts.length,
                        postsToShow,
                        firstFewFiltered: filteredPosts.slice(0, 3).map(p => ({ id: p.id, title: p.title }))
                      });
                      setDebugInfo(`Current state: All=${getSortedPosts().length}, Available=${totalAvailablePosts.length}, Filtered=${filteredPosts.length}, Showing=${postsToShow}`);
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      transition: 'all 0.2s ease',
                      minWidth: '120px'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    🔍 Debug Posts
                  </button>
                  <button 
                    onClick={() => {
                      const allPosts = getSortedPosts();
                      const uniqueIds = new Set(allPosts.map(p => p.id));
                      const duplicateIds = allPosts.filter(p => {
                        const count = allPosts.filter(pp => pp.id === p.id).length;
                        return count > 1;
                      });
                      
                      console.log('🔍 DEBUG: Raw posts analysis:', {
                        totalPosts: allPosts.length,
                        uniqueIds: uniqueIds.size,
                        duplicateIds: duplicateIds.length,
                        firstFewPosts: allPosts.slice(0, 5).map(p => ({ id: p.id, title: p.title, pubkey: p.pubkey }))
                      });
                      setDebugInfo(`Raw posts: Total=${allPosts.length}, Unique=${uniqueIds.size}, Duplicates=${duplicateIds.length}`);
                    }}
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #fd7e14 0%, #e55a00 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      transition: 'all 0.2s ease',
                      minWidth: '120px'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    🔍 Raw Posts
                  </button>
                </div>
              </div>
            )}
                         <div className={styles.postsGrid}>
               {debouncedFilteredPosts.length === 0 && follows.length === 0 ? (
                 <div className={styles.emptyState}>
                   You don&apos;t follow anyone yet. Follow some people on Nostr to see their longform posts here!
                 </div>
               ) : debouncedFilteredPosts.length === 0 && follows.length > 0 ? (
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
            {debouncedFilteredPosts.length > 0 && (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                borderTop: '1px solid rgb(39, 39, 42)',
                background: 'rgba(0, 0, 0, 0.3)',
                marginTop: '0'
              }}>
                {debouncedFilteredPosts.length === postsToShow && (
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