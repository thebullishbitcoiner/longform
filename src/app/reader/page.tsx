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
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [showDebugConsole, setShowDebugConsole] = useState(false);
  const setupSubscriptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventCountRef = useRef(0);

  // Fetch current user's follows (contact list)
  const fetchFollows = useCallback(async () => {
    console.log('🔍 DEBUG: fetchFollows called', { 
      ndk: !!ndk, 
      isAuthenticated, 
      isConnected,
      isLoading 
    });
    
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
      isConnected,
      isLoading
    });
    
    setDebugInfo('Setting up subscription...');
    
    // Clean up any existing subscription
    if (subscriptionRef.current) {
      console.log('🔄 DEBUG: Cleaning up existing subscription');
      subscriptionRef.current.stop();
      subscriptionRef.current = null;
    }
    
    // Reset loading state to ensure we can proceed
    setIsLoadingPosts(false);

    // Clear processed events (limit size to prevent memory leaks)
    if (processedEvents.current.size > 1000) {
      processedEvents.current.clear();
    }
    console.log('🧹 DEBUG: Cleared processed events');
    
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
              console.log('⏭️ DEBUG: Skipping already processed event:', event.id);
              return;
            }
            processedEvents.current.add(event.id);

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
      
      // Also try to fetch some recent events from follows to debug
      console.log('🔍 DEBUG: Testing fetchEvents for debugging...');
      
      // Test 1: Fetch any recent longform posts (not just from follows)
      ndk.fetchEvents({
        kinds: [30023],
        limit: 5
      }).then(events => {
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
      }).catch(error => {
        console.error('❌ DEBUG: Any longform posts test failed:', error);
      });
      
      // Test 2: Fetch events from follows (including regular notes)
      ndk.fetchEvents({
        kinds: [30023, 1], // Include regular notes too for debugging
        authors: follows.slice(0, 5), // Test with first 5 follows
        limit: 10
      }).then(events => {
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
      }).catch(error => {
        console.error('❌ DEBUG: Follows events test failed:', error);
      });
      
    } catch (error) {
      console.error('❌ DEBUG: Error setting up subscription:', error);
      // Clear the loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setIsLoadingPosts(false);
    }
  }, [ndk, follows, isAuthenticated, isConnected, addPost, updateAuthorProfile, getSortedPosts, isLoading]);

  // Set up the subscription when dependencies are ready
  useEffect(() => {
    console.log('🔄 DEBUG: Subscription useEffect triggered:', {
      followsLength: follows.length,
      isAuthenticated,
      isConnected,
      isLoadingPosts
    });
    
    if (follows.length > 0 && isAuthenticated && isConnected) {
      // Clear any existing timeout
      if (setupSubscriptionTimeoutRef.current) {
        clearTimeout(setupSubscriptionTimeoutRef.current);
      }
      
      // Add a small delay to ensure everything is properly initialized and prevent rapid re-setups
      setupSubscriptionTimeoutRef.current = setTimeout(() => {
        console.log('⏰ DEBUG: Setting up subscription after timeout');
        setupSubscription();
      }, 200);

      return () => {
        if (setupSubscriptionTimeoutRef.current) {
          clearTimeout(setupSubscriptionTimeoutRef.current);
        }
      };
    } else {
      console.log('❌ DEBUG: Cannot setup subscription - missing requirements:', {
        hasFollows: follows.length > 0,
        isAuthenticated,
        isConnected
      });
    }
  }, [follows, isAuthenticated, isConnected, setupSubscription, isLoadingPosts]);

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
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
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
                  setDebugInfo('Manual test triggered...');
                  // Test fetching any longform posts
                  ndk.fetchEvents({
                    kinds: [30023],
                    limit: 5
                  }).then(events => {
                    const eventArray = Array.from(events);
                    const authorsInFollows = eventArray.filter(e => follows.includes(e.pubkey));
                    setDebugInfo(`Manual test: Found ${events.size} longform posts, ${authorsInFollows.length} from your follows`);
                    console.log('Manual test events:', eventArray.map(e => ({
                      id: e.id,
                      kind: e.kind,
                      pubkey: e.pubkey,
                      title: getTagValue(e.tags, 'title') || 'No title',
                      isFollow: follows.includes(e.pubkey)
                    })));
                    console.log('Follows list:', follows);
                    console.log('Authors in follows:', authorsInFollows.map(e => e.pubkey));
                  }).catch(error => {
                    setDebugInfo(`Manual test failed: ${error}`);
                  });
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
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
                🔍 Test Any Longform
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing follows specifically...');
                  // Test fetching posts from your follows
                  if (follows.length === 0) {
                    setDebugInfo('No follows found');
                    return;
                  }
                  ndk.fetchEvents({
                    kinds: [30023],
                    authors: follows.slice(0, 3), // Test with first 3 follows
                    limit: 10
                  }).then(events => {
                    const eventArray = Array.from(events);
                    const longformEvents = eventArray.filter(e => e.kind === 30023);
                    const kindCounts = eventArray.reduce((acc, e) => {
                      acc[e.kind] = (acc[e.kind] || 0) + 1;
                      return acc;
                    }, {} as Record<number, number>);
                    
                    setDebugInfo(`Follows test: ${events.size} total events, ${longformEvents.length} longform. Kinds: ${JSON.stringify(kindCounts)}`);
                    console.log('Follows test events:', eventArray.map(e => ({
                      id: e.id,
                      kind: e.kind,
                      pubkey: e.pubkey,
                      title: getTagValue(e.tags, 'title') || 'No title'
                    })));
                    console.log('Event kind distribution:', kindCounts);
                  }).catch(error => {
                    setDebugInfo(`Follows test failed: ${error}`);
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
                👥 Test From Follows
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing any events from follows...');
                  // Test fetching any events from your follows
                  if (follows.length === 0) {
                    setDebugInfo('No follows found');
                    return;
                  }
                  ndk.fetchEvents({
                    authors: follows.slice(0, 3), // Test with first 3 follows
                    limit: 10
                  }).then(events => {
                    setDebugInfo(`Any events test: Found ${events.size} events from your follows`);
                    console.log('Any events test:', Array.from(events).map(e => ({
                      id: e.id,
                      kind: e.kind,
                      pubkey: e.pubkey,
                      content: e.content.substring(0, 50) + '...'
                    })));
                  }).catch(error => {
                    setDebugInfo(`Any events test failed: ${error}`);
                  });
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #ffc107 0%, #e0a800 100%)',
                  color: 'black',
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
                📝 Test Any Events
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing longform from all follows with broader search...');
                  // Test fetching longform posts from all follows with no time limit
                  if (follows.length === 0) {
                    setDebugInfo('No follows found');
                    return;
                  }
                  ndk.fetchEvents({
                    kinds: [30023],
                    authors: follows,
                    limit: 50 // Higher limit to find more posts
                  }).then(events => {
                    const eventArray = Array.from(events);
                    setDebugInfo(`Broad longform test: Found ${events.size} longform posts from your follows`);
                    console.log('Broad longform test:', eventArray.map(e => ({
                      id: e.id,
                      kind: e.kind,
                      pubkey: e.pubkey,
                      created_at: e.created_at,
                      title: getTagValue(e.tags, 'title') || 'No title',
                      date: new Date(e.created_at * 1000).toISOString(),
                      isInFollows: follows.includes(e.pubkey)
                    })));
                    
                    if (eventArray.length === 0) {
                      console.log('❌ No longform posts found from any of your follows');
                      console.log('Follows list (first 10):', follows.slice(0, 10));
                    }
                  }).catch(error => {
                    setDebugInfo(`Broad longform test failed: ${error}`);
                  });
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
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
                🔍 Deep Longform Search
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing with different relays...');
                  // Test with different relays that are known to have good longform content
                  const testRelays = [
                    'wss://relay.nostr.band',
                    'wss://purplepag.es',
                    'wss://relay.damus.io',
                    'wss://relay.primal.net'
                  ];
                  
                  Promise.all(testRelays.map(relay => 
                    ndk.fetchEvents({
                      kinds: [30023],
                      authors: follows.slice(0, 3),
                      limit: 5
                    }, {
                      relayUrls: [relay]
                    }).then(events => ({ relay, count: events.size }))
                    .catch(error => ({ relay, count: 0, error: error.message }))
                  )).then(results => {
                    const summary = results.map(r => `${r.relay}: ${r.count} posts`).join(', ');
                    setDebugInfo(`Relay test: ${summary}`);
                    console.log('Relay test results:', results);
                  }).catch(error => {
                    setDebugInfo(`Relay test failed: ${error}`);
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
                🌐 Test Different Relays
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Checking follows list...');
                  console.log('📋 Current follows list:', {
                    count: follows.length,
                    first10: follows.slice(0, 10),
                    last10: follows.slice(-10),
                    allFollows: follows
                  });
                  setDebugInfo(`Follows count: ${follows.length}. First 3: ${follows.slice(0, 3).join(', ')}`);
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #e83e8c 0%, #d63384 100%)',
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
                📋 Check Follows
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing first few follows for any activity...');
                  if (follows.length === 0) {
                    setDebugInfo('No follows found');
                    return;
                  }
                  
                  // Test the first 5 follows for any activity
                  const testFollows = follows.slice(0, 5);
                  console.log('🧪 Testing follows for activity:', testFollows);
                  
                  ndk.fetchEvents({
                    authors: testFollows,
                    limit: 20
                  }).then(events => {
                    const eventArray = Array.from(events);
                    const kindCounts = eventArray.reduce((acc, e) => {
                      acc[e.kind] = (acc[e.kind] || 0) + 1;
                      return acc;
                    }, {} as Record<number, number>);
                    
                    setDebugInfo(`Activity test: ${events.size} events from first 5 follows. Kinds: ${JSON.stringify(kindCounts)}`);
                    console.log('Activity test events:', eventArray.map(e => ({
                      id: e.id,
                      kind: e.kind,
                      pubkey: e.pubkey,
                      created_at: e.created_at,
                      content: e.content.substring(0, 50) + '...'
                    })));
                  }).catch(error => {
                    setDebugInfo(`Activity test failed: ${error}`);
                  });
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
                🧪 Test Activity
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing simple subscription...');
                  console.log('🧪 Testing simple subscription without grouping');
                  
                  // Create a simple test subscription for any longform posts
                  const testSub = ndk.subscribe(
                    { kinds: [30023], limit: 5 },
                    { groupable: false },
                    {
                      onEvent: (event) => {
                        const isInFollows = follows.includes(event.pubkey);
                        console.log('✅ Simple test subscription received event:', {
                          id: event.id,
                          kind: event.kind,
                          pubkey: event.pubkey,
                          title: getTagValue(event.tags, 'title') || 'No title',
                          isInFollows,
                          followIndex: isInFollows ? follows.indexOf(event.pubkey) : -1
                        });
                        setDebugInfo(`Simple test: Received event from ${event.pubkey} (in follows: ${isInFollows})`);
                      },
                      onEose: () => {
                        console.log('🏁 Simple test subscription EOSE');
                        setDebugInfo('Simple test: Subscription completed');
                      }
                    }
                  );
                  
                  console.log('🧪 Simple test subscription created:', testSub.internalId);
                  
                  // Stop the test subscription after 5 seconds
                  setTimeout(() => {
                    testSub.stop();
                    console.log('🧪 Simple test subscription stopped');
                  }, 5000);
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #6c757d 0%, #545b62 100%)',
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
                🧪 Test Simple Sub
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing subscription with small follows list...');
                  if (follows.length === 0) {
                    setDebugInfo('No follows found');
                    return;
                  }
                  
                  // Test with just the first 3 follows
                  const smallFollowsList = follows.slice(0, 3);
                  console.log('🧪 Testing subscription with small follows list:', smallFollowsList);
                  
                  const testSub = ndk.subscribe(
                    { kinds: [30023], authors: smallFollowsList, limit: 10 },
                    { groupable: false },
                    {
                      onEvent: (event) => {
                        console.log('✅ Small follows test received event:', {
                          id: event.id,
                          kind: event.kind,
                          pubkey: event.pubkey,
                          title: getTagValue(event.tags, 'title') || 'No title',
                          isInSmallList: smallFollowsList.includes(event.pubkey)
                        });
                        setDebugInfo(`Small follows test: Received event from ${event.pubkey}`);
                      },
                      onEose: () => {
                        console.log('🏁 Small follows test EOSE');
                        setDebugInfo('Small follows test: Subscription completed');
                      }
                    }
                  );
                  
                  console.log('🧪 Small follows test subscription created:', testSub.internalId);
                  
                  // Stop the test subscription after 5 seconds
                  setTimeout(() => {
                    testSub.stop();
                    console.log('🧪 Small follows test subscription stopped');
                  }, 5000);
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #20c997 0%, #17a2b8 100%)',
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
                🧪 Test Small Follows
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Cleaning follows list...');
                  
                  // Clean the current follows list
                  const cleanedFollows = follows.filter(pubkey => /^[0-9a-f]{64}$/i.test(pubkey));
                  const invalidFollows = follows.filter(pubkey => !/^[0-9a-f]{64}$/i.test(pubkey));
                  
                  console.log('🧹 Cleaning follows list:', {
                    original: follows.length,
                    valid: cleanedFollows.length,
                    invalid: invalidFollows.length,
                    invalidList: invalidFollows
                  });
                  
                  setFollows(cleanedFollows);
                  setDebugInfo(`Cleaned follows: ${cleanedFollows.length} valid, ${invalidFollows.length} invalid removed`);
                  
                  // Test subscription with cleaned list
                  setTimeout(() => {
                    console.log('🧪 Testing subscription with cleaned follows list...');
                    setupSubscription();
                  }, 1000);
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
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
                🧹 Clean & Test
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Testing context with manual post...');
                  // Test if the context is working by manually adding a test post
                  const testPost: BlogPost = {
                    id: 'test-post-' + Date.now(),
                    pubkey: follows[0] || 'test-pubkey',
                    created_at: Math.floor(Date.now() / 1000),
                    content: 'This is a test post to verify the context is working.',
                    title: 'Test Post',
                    summary: 'A test post for debugging',
                    published_at: Math.floor(Date.now() / 1000),
                    image: '',
                    tags: []
                  };
                  
                  addPost(testPost);
                  setDebugInfo(`Added test post. Total posts now: ${getSortedPosts().length}`);
                  console.log('Test post added:', testPost);
                  console.log('All posts in context:', getSortedPosts());
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
                🧪 Test Context
              </button>
              <button 
                onClick={() => {
                  setDebugInfo('Checking subscription status...');
                  const status = {
                    hasSubscription: !!subscriptionRef.current,
                    subscriptionId: subscriptionRef.current?.internalId,
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
                  setDebugInfo('Forcing subscription setup...');
                  console.log('🔧 DEBUG: Manually forcing subscription setup');
                  setupSubscription();
                }}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #20c997 0%, #17a2b8 100%)',
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
                🔧 Force Subscription
              </button>
              <button 
                onClick={() => setShowDebugConsole(false)}
                style={{
                  padding: '10px 16px',
                  background: 'linear-gradient(135deg, #6c757d 0%, #545b62 100%)',
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
                ❌ Hide Debug
              </button>
            </div>
          </div>
        )}
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