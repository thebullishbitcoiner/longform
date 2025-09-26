'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useBlog, BlogPost } from '@/contexts/BlogContext';
import { getTagValue, getTagValues } from '@/utils/nostr';
import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';

export default function Home() {
  const { isAuthenticated, ndk } = useNostr();
  const { addPost, getSortedPosts, getAuthorProfile, fetchProfileOnce } = useBlog();
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [visiblePostsCount, setVisiblePostsCount] = useState(10);
  
  const subscriptionRef = useRef<{ stop: () => void } | null>(null);
  const processedEvents = useRef<Set<string>>(new Set());
  const eventCountRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogin = () => {
    // Launch nostr-login welcome screen
    document.dispatchEvent(new CustomEvent('nlLaunch', { detail: 'welcome' }));
  };

  // Filter posts to only show those created with Longform._
  const longformPosts = useMemo(() => {
    return getSortedPosts().filter(post => post.client === 'Longform._');
  }, [getSortedPosts]);
  
  // Get visible posts based on count
  const visiblePosts = useMemo(() => {
    return longformPosts.slice(0, visiblePostsCount);
  }, [longformPosts, visiblePostsCount]);
  
  // Randomly select posts for hero style (up to 3 posts from posts WITH images)
  const heroStylePosts = useMemo(() => {
    if (longformPosts.length === 0) return [];
    const postsWithImages = longformPosts.filter(post => post.image);
    return [...postsWithImages].sort(() => Math.random() - 0.5).slice(0, Math.min(3, postsWithImages.length));
  }, [longformPosts]);
  

  // Load more posts function
  const loadMorePosts = useCallback(() => {
    setVisiblePostsCount(prev => prev + 10);
  }, []);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && visiblePostsCount < longformPosts.length) {
          loadMorePosts();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px',
      }
    );

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [visiblePostsCount, longformPosts.length, loadMorePosts]);

  const setupSubscription = useCallback(async () => {
    if (!ndk) {
      console.log('Home: No NDK available');
      setIsLoading(false);
      return;
    }

    // Check if NDK is connected
    const connectedRelays = ndk.pool.connectedRelays();
    if (connectedRelays.length === 0) {
      console.log('Home: No connected relays, waiting for connection...');
      // Wait a bit for connection, but don't wait indefinitely
      setTimeout(() => {
        const stillConnected = ndk.pool.connectedRelays();
        if (stillConnected.length === 0) {
          console.log('Home: Still no connected relays after timeout, stopping loading');
          setIsLoading(false);
        }
      }, 3000);
    }

    // Clear previous subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.stop();
      subscriptionRef.current = null;
    }

    // Clear any existing fallback timeout
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    setIsLoading(true);
    processedEvents.current.clear();
    eventCountRef.current = 0;

    try {
      // Create filter to get all longform posts with Longform._ client tag
      const filter = {
        kinds: [30023], // Longform posts
        '#client': ['Longform._'] // Filter by client tag
      };

      console.log('Home: Setting up subscription for all Longform._ posts');
      
      // First, try to fetch existing posts to catch any we might have missed
      // Use a more comprehensive approach to get all posts
      const existingEvents = await ndk.fetchEvents({
        kinds: [30023],
        '#client': ['Longform._']
      }, {
        groupable: false,
        closeOnEose: true
      });
      
      console.log('Home: Fetched existing events:', existingEvents.size);
      
      // Also try fetching without client filter to catch any posts that might not have the client tag properly set
      const allLongformEvents = await ndk.fetchEvents({
        kinds: [30023]
      }, {
        groupable: false,
        closeOnEose: true
      });
      
      console.log('Home: Fetched all longform events:', allLongformEvents.size);
      
      // Filter for Longform._ posts from the broader search and add to existing events
      const existingEventIds = new Set(Array.from(existingEvents).map(e => e.id));
      allLongformEvents.forEach(event => {
        const client = getTagValue(event.tags, 'client');
        if (client === 'Longform._' && !existingEventIds.has(event.id)) {
          existingEvents.add(event);
        }
      });
      
      console.log('Home: Total Longform._ events found:', existingEvents.size);
      
      // Process existing events
      existingEvents.forEach(event => {
        if (processedEvents.current.has(event.id)) return;
        
        try {
          const title = getTagValue(event.tags, 'title') || 'Untitled';
          const summary = getTagValue(event.tags, 'summary') || '';
          const published_at = parseInt(getTagValue(event.tags, 'published_at') || event.created_at.toString());
          const image = getTagValue(event.tags, 'image');
          const tags = getTagValues(event.tags, 't');
          const dTag = getTagValue(event.tags, 'd');
          const client = getTagValue(event.tags, 'client');

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
          processedEvents.current.add(event.id);
        } catch (error) {
          console.error('Error processing existing event:', error);
        }
      });

      // Stop loading immediately after processing existing events
      // This ensures we don't show "Loading posts..." indefinitely when no posts are found
      setIsLoading(false);

      // Set up a fallback timeout to ensure loading stops even if there are network issues
      fallbackTimeoutRef.current = setTimeout(() => {
        console.log('Home: Fallback timeout reached, ensuring loading state is stopped');
        setIsLoading(false);
      }, 10000); // 10 second fallback

      subscriptionRef.current = ndk.subscribe(
        filter,
        { 
          closeOnEose: false,
          groupable: false
        },
        {
          onEvent: async (event) => {
            if (isNavigating) {
              return;
            }
            
            // Skip if we've already processed this event
            if (processedEvents.current.has(event.id)) {
              return;
            }
            processedEvents.current.add(event.id);
            eventCountRef.current++;

            try {
              const title = getTagValue(event.tags, 'title') || 'Untitled';
              const summary = getTagValue(event.tags, 'summary') || '';
              const published_at = parseInt(getTagValue(event.tags, 'published_at') || event.created_at.toString());
              const image = getTagValue(event.tags, 'image');
              const tags = getTagValues(event.tags, 't');
              const dTag = getTagValue(event.tags, 'd');
              const client = getTagValue(event.tags, 'client');

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

              // Fetch author profile if not already cached
              if (!getAuthorProfile(event.pubkey)) {
                fetchProfileOnce(event.pubkey, async () => {
                  try {
                    const profileEvent = await ndk.fetchEvent({
                      kinds: [0],
                      authors: [event.pubkey]
                    });
                    
                    if (profileEvent) {
                      const profile = JSON.parse(profileEvent.content);
                      return {
                        name: profile.name,
                        displayName: profile.display_name,
                        picture: profile.picture,
                        nip05: profile.nip05
                      };
                    }
                  } catch (error) {
                    console.error('Error fetching profile:', error);
                  }
                  return null;
                });
              }
            } catch (error) {
              console.error('Error processing event:', error);
            }
          }
        }
      );

    } catch (error) {
      console.error('Error setting up subscription:', error);
      setIsLoading(false);
    }
  }, [ndk, addPost, getAuthorProfile, fetchProfileOnce, isNavigating]);

  useEffect(() => {
    if (ndk) {
      setupSubscription();
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
      }
      // Clear any pending fallback timeout
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
    };
  }, [ndk, setupSubscription]);

  // Handle navigation state
  useEffect(() => {
    const handleRouteChange = () => {
      if (window.location.pathname === '/') {
        setIsNavigating(false);
      } else {
        setIsNavigating(true);
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

  if (!isAuthenticated) {
    return (
      <main className="container">
        <div className="welcome-section">
          <div className="welcome-content">
            <h1 className="welcome-title">A focused space for Nostr longform.</h1>
            <p className="welcome-description">
              Create, edit, and read longform content in a clean, distraction-free environment.
            </p>
            <button 
              onClick={handleLogin}
              className="login-button"
            >
              Login with Nostr
            </button>
            <div className="beta-notice">
              <p>This app is currently in beta testing.</p>
              <p>If you have any issues, submit it on <a href="https://github.com/thebullishbitcoiner/longform/issues" target="_blank" rel="noopener noreferrer">GitHub</a> or @ me on <a href="https://njump.me/npub15ypxpg429uyjmp0zczuza902chuvvr4pn35wfzv8rx6cej4z8clq6jmpcx" target="_blank" rel="noopener noreferrer">Nostr</a>.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.homeContainer}>
        <div className={styles.header}>
          <h1 className={styles.title}>Created with Longform._</h1>
          <p className={styles.subtitle}>The Nostr client focused on everything longform.</p>
        </div>

        {isLoading && longformPosts.length === 0 && (
          <div className={styles.loading}>
            <p>Loading posts...</p>
          </div>
        )}

        {!isLoading && longformPosts.length === 0 && (
          <div className={styles.empty}>
            <p>No posts found. Be the first to create a longform post!</p>
            <Link href="/mylongform" className={styles.createButton}>
              Create Post
            </Link>
          </div>
        )}

        {visiblePosts.length > 0 && (
          <div className={styles.postsSection}>
            {/* Hero Style Posts - Hidden on smaller screens */}
            <div className={styles.heroSection}>
              {heroStylePosts.length > 0 && (
                <div className={styles.heroGrid}>
                  {heroStylePosts.map((post) => {
                    const author = getAuthorProfile(post.pubkey);
                    const authorName = author?.displayName || author?.name || 'Anonymous';
                    const authorPicture = author?.picture;
                    
                    return (
                      <Link 
                        key={post.id} 
                        href={`/reader/${post.pubkey}/${post.dTag}`}
                        className={styles.heroCard}
                      >
                        {post.image && (
                          <div className={styles.heroImage}>
                            <Image
                              src={post.image}
                              alt={post.title}
                              width={600}
                              height={300}
                              className={styles.image}
                              unoptimized
                            />
                          </div>
                        )}
                        <div className={styles.heroContent}>
                          <h3 className={styles.heroPostTitle}>{post.title}</h3>
                          {post.summary && (
                            <p className={styles.heroPostSummary}>{post.summary}</p>
                          )}
                          <div className={styles.heroMeta}>
                            <div className={styles.author}>
                              {authorPicture ? (
                                <Image
                                  src={authorPicture}
                                  alt={authorName}
                                  width={32}
                                  height={32}
                                  className={styles.authorImage}
                                  unoptimized
                                />
                              ) : (
                                <div className={styles.authorPlaceholder} />
                              )}
                              <span className={styles.authorName}>{authorName}</span>
                            </div>
                            <time className={styles.postDate}>
                              {new Date(post.published_at * 1000).toLocaleDateString()}
                            </time>
                          </div>
                          {post.tags.length > 0 && (
                            <div className={styles.tags}>
                              {post.tags.slice(0, 3).map((tag, index) => (
                                <span key={index} className={styles.tag}>
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* All Posts - Profile Style Cards on smaller screens, List Style on larger screens */}
            <div className={styles.allPostsSection}>
              {visiblePosts
                .sort((a, b) => b.created_at - a.created_at) // Always chronological order
                .map((post) => {
                const author = getAuthorProfile(post.pubkey);
                const authorName = author?.displayName || author?.name || 'Anonymous';
                
                return (
                  <Link 
                    key={post.id} 
                    href={`/reader/${post.pubkey}/${post.dTag}`}
                    className={styles.postCard}
                  >
                    {post.image && (
                      <div className={styles.postImage}>
                        <Image
                          src={post.image}
                          alt={post.title}
                          width={320}
                          height={213}
                          className={styles.postImageContent}
                          unoptimized
                        />
                      </div>
                    )}
                    <div className={styles.postContent}>
                      <h3 className={styles.postTitle}>{post.title}</h3>
                      <div className={styles.postAuthor}>
                        by {authorName}
                      </div>
                      {post.summary && (
                        <p className={styles.postSummary}>{post.summary}</p>
                      )}
                      <div className={styles.postMeta}>
                        <time className={styles.postDate}>
                          {new Date(post.published_at * 1000).toLocaleDateString()}
                        </time>
                        {post.tags.length > 0 && (
                          <div className={styles.postTags}>
                            {post.tags.slice(0, 3).map((tag, index) => (
                              <span key={index} className={styles.tag}>
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Load More Trigger */}
            {visiblePostsCount < longformPosts.length && (
              <div ref={loadMoreRef} className={styles.loadMoreTrigger}>
                <div className={styles.loadMoreText}>
                  <p>Scroll down to load more posts</p>
                </div>
              </div>
            )}

            {/* End of posts indicator */}
            {visiblePostsCount >= longformPosts.length && longformPosts.length > 0 && (
              <div className={styles.endOfPosts}>
                <p>You&apos;ve reached the end of all posts!</p>
              </div>
            )}
          </div>
        )}
    </main>
  );
}
