'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useBlog } from '@/contexts/BlogContext';
import type { BlogPost } from '@/contexts/BlogContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { ArrowLeftIcon, HeartIcon, ChatBubbleLeftIcon, BoltIcon, XMarkIcon } from '@heroicons/react/24/outline';
import styles from './page.module.css';
import { useNostr } from '@/contexts/NostrContext';
import { nip19 } from 'nostr-tools';
import NDK from '@nostr-dev-kit/ndk';
import { resolveNip05 } from '@/utils/nostr';
import Image from 'next/image';

// Create a standalone NDK instance for public access
const createStandaloneNDK = () => {
  return new NDK({
    explicitRelayUrls: [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://relay.primal.net'
    ]
  });
};

interface ReactionStats {
  likes: number;
  comments: number;
  zaps: number;
  isLoading: boolean;
}

interface ZapData {
  id: string;
  pubkey: string;
  amount: number;
  content?: string;
  created_at: number;
  authorName?: string;
}

interface ReactionData {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  authorName?: string;
}

export default function BlogPost() {
  const params = useParams();
  const { addPost, markPostAsRead, getAuthorProfile, fetchProfileOnce } = useBlog();
  const { ndk: contextNdk, isAuthenticated } = useNostr();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [processedContent, setProcessedContent] = useState('');
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);
  const [reactionStats, setReactionStats] = useState<ReactionStats>({
    likes: 0,
    comments: 0,
    zaps: 0,
    isLoading: true
  });
  const [showZapsModal, setShowZapsModal] = useState(false);
  const [zapData, setZapData] = useState<ZapData[]>([]);
  const [isLoadingZaps, setIsLoadingZaps] = useState(false);
  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [reactionData, setReactionData] = useState<ReactionData[]>([]);
  const [isLoadingReactions, setIsLoadingReactions] = useState(false);
  const endOfContentRef = useRef<HTMLDivElement>(null);

  // Initialize standalone NDK if context NDK is not available
  useEffect(() => {
    if (!contextNdk && !standaloneNdk) {
      const ndk = createStandaloneNDK();
      ndk.connect().then(() => {
        setStandaloneNdk(ndk);
      }).catch(error => {
        console.error('Failed to connect standalone NDK:', error);
      });
    }
  }, [contextNdk, standaloneNdk]);

  const fetchReactionStats = useCallback(async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    setReactionStats(prev => ({ ...prev, isLoading: true }));

    try {
      // Fetch reactions (kind 7)
      const reactions = await ndkToUse.fetchEvents({
        kinds: [7],
        '#e': [postId]
      });

      // Fetch comments (kind 1111 - NIP-22 and kind 1 for backwards compatibility)
      const nip22Comments = await ndkToUse.fetchEvents({
        kinds: [1111],
        '#e': [postId]
      });

      const kind1Comments = await ndkToUse.fetchEvents({
        kinds: [1],
        '#e': [postId]
      });

      // Filter kind 1 comments to only include those that are actually comments on this post
      // Look for 'a' tags that reference this post as the root
      const validKind1Comments = Array.from(kind1Comments).filter(event => {
        return event.tags.some((tag: string[]) => 
          tag[0] === 'a' && 
          tag[1] && 
          tag[1].startsWith('30023:') && 
          tag[1].includes(postId)
        );
      });

      const totalComments = nip22Comments.size + validKind1Comments.length;

      // Fetch zaps (kind 9735)
      const zaps = await ndkToUse.fetchEvents({
        kinds: [9735],
        '#e': [postId]
      });

      // Count positive reactions (likes)
      const positiveReactions = Array.from(reactions).filter(event => {
        const content = event.content.trim();
        return content === '+' || content === '❤️' || content === '👍' || content === 'like' || content === 'heart';
      });

      setReactionStats({
        likes: positiveReactions.length,
        comments: totalComments,
        zaps: zaps.size,
        isLoading: false
      });

    } catch (error) {
      console.error('Error fetching reaction stats:', error);
      setReactionStats(prev => ({ ...prev, isLoading: false }));
    }
  }, [contextNdk, standaloneNdk]);

  const loadAdditionalData = useCallback(async (postData: BlogPost) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      console.log('🔍 DEBUG: No NDK available for loading additional data');
      return;
    }

    // Define processNpubs inside useCallback
    const processNpubs = async (content: string, ndk: NDK) => {
      let processedContent = content;
      const npubRegex = /nostr:npub1[a-zA-Z0-9]+/g;
      const npubs = content.match(npubRegex) || [];
      for (const npub of npubs) {
        const npubPart = npub.replace('nostr:', '');
        try {
          const decoded = nip19.decode(npubPart);
          if (decoded.type === 'npub') {
            const hex = decoded.data;
            const user = ndk.getUser({ pubkey: hex });
            const profile = await user.fetchProfile();
            if (profile && (profile.displayName || profile.name)) {
              const username = profile.displayName || profile.name;
              const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
              processedContent = processedContent.replace(npub, njumpLink);
            } else {
              // Use a placeholder if profile fetch failed
              const username = npubPart.slice(0, 8) + '...';
              const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
              processedContent = processedContent.replace(npub, njumpLink);
            }
          }
        } catch (error) {
          console.error('Error processing npub:', error);
          // Use a placeholder if decoding failed
          const username = npubPart.slice(0, 8) + '...';
          const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
          processedContent = processedContent.replace(npub, njumpLink);
        }
      }
      return processedContent;
    };

    console.log('🔍 DEBUG: Loading additional data for post:', postData.id);

    try {
      // Process content to replace npubs with usernames
      console.log('🔍 DEBUG: Processing content for npubs');
      const content = await processNpubs(postData.content, ndkToUse);
      setProcessedContent(content);
      
      // Fetch author profile if not already available
      if (!postData.author) {
        console.log('🔍 DEBUG: Fetching author profile for:', postData.pubkey);
        
        // Check if we already have this profile cached
        const cachedProfile = getAuthorProfile(postData.pubkey);
        if (cachedProfile) {
          console.log('🔍 DEBUG: Using cached profile for:', postData.pubkey);
          const updatedPost = { ...postData, author: cachedProfile };
          setPost(updatedPost);
        } else {
          console.log('🔍 DEBUG: Fetching profile for blog post:', postData.pubkey);
          const profile = await fetchProfileOnce(postData.pubkey, async () => {
            const user = ndkToUse.getUser({ pubkey: postData.pubkey });
            const profile = await user.fetchProfile();
            if (profile) {
              console.log('🔍 DEBUG: Fetched profile:', { 
                name: profile.name, 
                displayName: profile.displayName 
              });
              return {
                name: profile.name,
                displayName: profile.displayName
              };
            }
            console.log('🔍 DEBUG: No profile found for:', postData.pubkey);
            return null;
          });
          
          if (profile) {
            const updatedPost = { ...postData, author: profile };
            setPost(updatedPost);
            console.log('🔍 DEBUG: Updated post with author profile');
          }
        }
      } else {
        console.log('🔍 DEBUG: Post already has author profile');
      }
      
      console.log('🔍 DEBUG: Additional data loading completed');
    } catch (error) {
      console.error('🔍 DEBUG: Error loading additional data:', error);
    }
  }, [contextNdk, standaloneNdk, getAuthorProfile, fetchProfileOnce]);

  const fetchPostByAuthorAndDTag = useCallback(async (pubkey: string, dTag: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      console.log('🔍 DEBUG: No NDK available for fetching post');
      setLoading(false);
      return;
    }

    try {
      console.log('🔍 DEBUG: Fetching events with:', { pubkey, dTag, kind: 30023 });
      
      // Fetch the most recent event with the given author and d tag
      const events = await ndkToUse.fetchEvents({
        kinds: [30023], // Longform posts
        authors: [pubkey],
        '#d': [dTag]
      });

      console.log('🔍 DEBUG: Fetched events count:', events.size);

      if (events.size > 0) {
        // Get the most recent event
        const sortedEvents = Array.from(events).sort((a, b) => b.created_at - a.created_at);
        const event = sortedEvents[0];
        
        console.log('🔍 DEBUG: Selected most recent event:', { 
          id: event.id, 
          created_at: event.created_at,
          title: event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled'
        });

        const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
        const summary = event.tags.find(tag => tag[0] === 'summary')?.[1] || '';
        const published_at = parseInt(event.tags.find(tag => tag[0] === 'published_at')?.[1] || event.created_at.toString());
        const image = event.tags.find(tag => tag[0] === 'image')?.[1];
        const tags = event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]);

        const postData = {
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

        console.log('🔍 DEBUG: Created post data:', { 
          id: postData.id, 
          title: postData.title, 
          contentLength: postData.content.length 
        });

        // Show content immediately
        setPost(postData);
        setProcessedContent(event.content);
        setLoading(false);

        // Load additional data in background
        setIsLoadingAdditionalData(true);
        await loadAdditionalData(postData);
        setIsLoadingAdditionalData(false);
        
        console.log('🔍 DEBUG: Post loaded successfully');

        // Only add post to context if user is authenticated (to avoid polluting local storage)
        if (isAuthenticated) {
          addPost(postData);
        }
      } else {
        console.log('🔍 DEBUG: No events found for pubkey and dTag:', { pubkey, dTag });
        setLoading(false);
      }
    } catch (error) {
      console.error('🔍 DEBUG: Error fetching post:', error);
      setLoading(false);
    }
  }, [contextNdk, standaloneNdk, isAuthenticated, addPost, loadAdditionalData]);

  // Resolve author and fetch post
  useEffect(() => {
    const resolveAuthor = async () => {
      if (!params.author || !params.d) {
        console.log('🔍 DEBUG: Missing params:', { author: params.author, d: params.d });
        return;
      }

      const ndkToUse = contextNdk || standaloneNdk;
      if (!ndkToUse) {
        console.log('🔍 DEBUG: No NDK available');
        return;
      }

      try {
        const author = decodeURIComponent(params.author as string);
        const dTag = decodeURIComponent(params.d as string);
        
        console.log('🔍 DEBUG: Resolving author:', { author, dTag });

        // Resolve the author identifier to a pubkey
        const pubkey = await resolveNip05(ndkToUse, author);
        
        console.log('🔍 DEBUG: Resolved pubkey:', { author, pubkey });

        if (pubkey) {
          console.log('🔍 DEBUG: Fetching post with pubkey and dTag:', { pubkey, dTag });
          await fetchPostByAuthorAndDTag(pubkey, dTag);
        } else {
          console.log('🔍 DEBUG: Could not resolve author identifier:', author);
          setLoading(false);
        }
      } catch (error) {
        console.error('🔍 DEBUG: Error resolving author:', error);
        setLoading(false);
      }
    };

    resolveAuthor();
  }, [params.author, params.d, contextNdk, standaloneNdk, fetchPostByAuthorAndDTag]);

  // Fetch reaction stats when post is loaded
  useEffect(() => {
    if (post?.id) {
      fetchReactionStats(post.id);
    }
  }, [post?.id, fetchReactionStats]);

  const fetchZapDetails = async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    setIsLoadingZaps(true);
    setShowZapsModal(true);

    try {
      // Fetch zaps (kind 9735)
      const zaps = await ndkToUse.fetchEvents({
        kinds: [9735],
        '#e': [postId]
      });

      const zapDetails: ZapData[] = [];

      for (const zap of zaps) {
        try {
          // Parse zap event to extract amount and other details
          const amountTag = zap.tags.find(tag => tag[0] === 'amount');
          const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
          
          let amount = 0;
          if (amountTag && amountTag[1]) {
            amount = parseInt(amountTag[1]) / 1000; // Convert from millisats to sats
          }

          // Try to get author name
          let authorName: string | undefined;
          try {
            const cachedProfile = getAuthorProfile(zap.pubkey);
            if (cachedProfile) {
              authorName = cachedProfile.displayName || cachedProfile.name;
            } else {
              const user = ndkToUse.getUser({ pubkey: zap.pubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                authorName = profile.displayName || profile.name;
              }
            }
          } catch (error) {
            console.error('Error fetching zap author profile:', error);
          }

          zapDetails.push({
            id: zap.id,
            pubkey: zap.pubkey,
            amount,
            content: descriptionTag?.[1] || zap.content,
            created_at: zap.created_at,
            authorName
          });
        } catch (error) {
          console.error('Error parsing zap event:', error);
        }
      }

      // Sort by amount (highest first)
      zapDetails.sort((a, b) => b.amount - a.amount);
      setZapData(zapDetails);

    } catch (error) {
      console.error('Error fetching zap details:', error);
    } finally {
      setIsLoadingZaps(false);
    }
  };

  const handleZapsClick = () => {
    if (post?.id) {
      fetchZapDetails(post.id);
    }
  };

  const fetchReactionDetails = async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    setIsLoadingReactions(true);
    setShowReactionsModal(true);

    try {
      // Fetch reactions (kind 7)
      const reactions = await ndkToUse.fetchEvents({
        kinds: [7],
        '#e': [postId]
      });

      const reactionDetails: ReactionData[] = [];

      for (const reaction of reactions) {
        try {
          const content = reaction.content.trim();
          
          // Skip empty reactions
          if (!content) continue;

          // Try to get author name
          let authorName: string | undefined;
          try {
            const cachedProfile = getAuthorProfile(reaction.pubkey);
            if (cachedProfile) {
              authorName = cachedProfile.displayName || cachedProfile.name;
            } else {
              const user = ndkToUse.getUser({ pubkey: reaction.pubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                authorName = profile.displayName || profile.name;
              }
            }
          } catch (error) {
            console.error('Error fetching reaction author profile:', error);
          }

          reactionDetails.push({
            id: reaction.id,
            pubkey: reaction.pubkey,
            content,
            created_at: reaction.created_at,
            authorName
          });
        } catch (error) {
          console.error('Error parsing reaction event:', error);
        }
      }

      // Sort by creation date (newest first)
      reactionDetails.sort((a, b) => b.created_at - a.created_at);
      setReactionData(reactionDetails);

    } catch (error) {
      console.error('Error fetching reaction details:', error);
    } finally {
      setIsLoadingReactions(false);
    }
  };

  const handleReactionsClick = () => {
    if (post?.id) {
      fetchReactionDetails(post.id);
    }
  };

  // Mark post as read when end of content is reached (only if authenticated)
  useEffect(() => {
    if (!post || hasMarkedAsRead || !endOfContentRef.current || !isAuthenticated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          markPostAsRead(post.id);
          setHasMarkedAsRead(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 } // Trigger when at least 50% of the element is visible
    );

    observer.observe(endOfContentRef.current);

    return () => {
      observer.disconnect();
    };
  }, [post, hasMarkedAsRead, markPostAsRead, isAuthenticated]);

  // Function to check if a URL is a video link
  const isVideoUrl = (url: string): boolean => {
    const videoPatterns = [
      /youtube\.com\/watch\?v=/,
      /youtu\.be\//,
      /vimeo\.com\//,
      /dailymotion\.com\/video\//,
      /\.mp4$/,
      /\.webm$/,
      /\.ogg$/,
      /\.mov$/,
      /\.avi$/,
      /\.mkv$/,
      /\.wmv$/,
      /\.flv$/,
      /\.m4v$/,
      /\.3gp$/,
      /\.ogv$/
    ];
    
    return videoPatterns.some(pattern => pattern.test(url));
  };

  // Function to get video embed URL
  const getVideoEmbedUrl = (url: string): string | null => {
    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }
    
    // Dailymotion
    const dailymotionMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (dailymotionMatch) {
      return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;
    }
    
    // Direct video files
    const directVideoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.m4v', '.3gp', '.ogv'];
    if (directVideoExtensions.some(ext => url.toLowerCase().includes(ext))) {
      return url;
    }
    
    return null;
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.href;
    if (href.startsWith('nostr:')) {
      e.preventDefault();
      // Handle nostr links (you can add specific handling here)
      console.log('Nostr link clicked:', href);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (!post) {
    return (
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <div className={styles.notFound}>
            <h1>Post not found</h1>
            <p>The requested post could not be found. This might be because:</p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>The author identifier is not valid</li>
              <li>The post has been deleted or moved</li>
              <li>The NIP-05 identifier could not be resolved</li>
            </ul>
            {isAuthenticated && (
              <Link href="/reader" className={styles.backLink}>
                <ArrowLeftIcon className={styles.icon} />
                Back to reader
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        {isAuthenticated && (
          <Link href="/reader" className={styles.backLink}>
            <ArrowLeftIcon className={styles.icon} />
            Back to reader
          </Link>
        )}

        <article className={styles.post}>
          {post.image && (
            <div className={styles.postImage}>
              <Image src={post.image} alt={post.title} width={800} height={400} style={{ width: '100%', height: 'auto' }} />
            </div>
          )}

          <header className={styles.header}>
            <h1 className={styles.title}>{post.title}</h1>
            <div className={styles.metadata}>
              <div className={styles.author}>
                <span className={styles.label}>Author:</span>
                <span className={styles.authorValue}>
                  {(() => {
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
                  })()}
                </span>
                {isLoadingAdditionalData && !post.author && !getAuthorProfile(post.pubkey) && (
                  <span className={styles.loadingIndicator}> (loading...)</span>
                )}
              </div>
              <div className={styles.date}>
                <span className={styles.label}>Published:</span>
                <time>{new Date(post.created_at * 1000).toLocaleDateString()}</time>
              </div>
            </div>
            
            {/* Reaction Stats */}
            <div className={styles.reactionStats}>
              <div className={styles.reactionItem} onClick={handleZapsClick} style={{ cursor: 'pointer' }}>
                <BoltIcon className={styles.reactionIcon} />
                <span className={styles.reactionCount}>
                  {reactionStats.isLoading ? '...' : reactionStats.zaps}
                </span>
                <span className={styles.reactionLabel}>Zaps</span>
              </div>
              <div className={styles.reactionItem} onClick={handleReactionsClick} style={{ cursor: 'pointer' }}>
                <HeartIcon className={styles.reactionIcon} />
                <span className={styles.reactionCount}>
                  {reactionStats.isLoading ? '...' : reactionStats.likes}
                </span>
                <span className={styles.reactionLabel}>Reactions</span>
              </div>
              <div className={styles.reactionItem}>
                <ChatBubbleLeftIcon className={styles.reactionIcon} />
                <span className={styles.reactionCount}>
                  {reactionStats.isLoading ? '...' : reactionStats.comments}
                </span>
                <span className={styles.reactionLabel}>Comments</span>
              </div>
            </div>
            
            {post.tags.length > 0 && (
              <div className={styles.tags}>
                {post.tags.map((tag: string) => (
                  <span key={tag} className={styles.tag}>#{tag}</span>
                ))}
              </div>
            )}
          </header>

          {post.summary && (
            <div className={styles.summary}>{post.summary}</div>
          )}

          <div className={styles.postContent}>
            {isLoadingAdditionalData && processedContent === post.content && (
              <div className={styles.processingIndicator}>
                Processing content...
              </div>
            )}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ ...props }) => {
                  const isNostrLink = props.href?.includes('njump.me');
                  const isVideoLink = props.href ? isVideoUrl(props.href) : false;
                  
                  if (isVideoLink && props.href) {
                    const embedUrl = getVideoEmbedUrl(props.href);
                    if (embedUrl) {
                      return (
                        <span className={styles.videoContainer}>
                          {embedUrl.includes('youtube.com/embed') || embedUrl.includes('vimeo.com') || embedUrl.includes('dailymotion.com') ? (
                            <iframe
                              src={embedUrl}
                              title="Video player"
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className={styles.videoEmbed}
                            />
                          ) : (
                            <video
                              controls
                              className={styles.videoPlayer}
                              preload="metadata"
                            >
                              <source src={embedUrl} type="video/mp4" />
                              <source src={embedUrl} type="video/webm" />
                              <source src={embedUrl} type="video/ogg" />
                              Your browser does not support the video tag.
                            </video>
                          )}
                          <span className={styles.videoCaption}>
                            <a href={props.href} target="_blank" rel="noopener noreferrer" className={styles.videoLink}>
                              {props.children}
                            </a>
                          </span>
                        </span>
                      );
                    }
                  }
                  
                  const isRegularLink = props.href?.startsWith('http://') || props.href?.startsWith('https://');
                  const linkClass = isNostrLink ? styles.nostrLink : isRegularLink ? styles.regularLink : styles.link;
                  return (
                    <a 
                      {...props} 
                      onClick={handleLinkClick} 
                      className={linkClass}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  );
                },
                li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => {
                  // Check if this is a task list item (checkbox)
                  const child = children as React.ReactElement;
                  if (child && typeof child === 'object' && child.props && typeof child.props === 'object' && 'checked' in child.props) {
                    return (
                      <li {...props} className={styles.taskListItem}>
                        {children}
                      </li>
                    );
                  }
                  return <li {...props}>{children}</li>;
                },
                input: ({ checked, ...props }: React.ComponentPropsWithoutRef<'input'>) => {
                  if (props.type === 'checkbox') {
                    return (
                      <input
                        {...props}
                        type="checkbox"
                        checked={checked}
                        className={styles.taskCheckbox}
                        readOnly
                      />
                    );
                  }
                  return <input {...props} />;
                },
              }}
            >
              {processedContent}
            </ReactMarkdown>
            <div ref={endOfContentRef} style={{ height: '1px' }} />
          </div>
        </article>
      </div>

      {/* Zaps Modal */}
      {showZapsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowZapsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Zaps</h2>
              <button 
                className={styles.modalCloseButton}
                onClick={() => setShowZapsModal(false)}
              >
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {isLoadingZaps ? (
                <div className={styles.modalLoading}>Loading zaps...</div>
              ) : zapData.length === 0 ? (
                <div className={styles.modalEmpty}>No zaps yet</div>
              ) : (
                <div className={styles.zapList}>
                  {zapData.map((zap) => (
                    <div key={zap.id} className={styles.zapItem}>
                      <span className={styles.zapAuthorName}>
                        {zap.authorName || zap.pubkey.slice(0, 8) + '...'}
                      </span>
                      <span className={styles.zapAmount}>
                        ⚡ {zap.amount} sats
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reactions Modal */}
      {showReactionsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowReactionsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Reactions</h2>
              <button 
                className={styles.modalCloseButton}
                onClick={() => setShowReactionsModal(false)}
              >
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {isLoadingReactions ? (
                <div className={styles.modalLoading}>Loading reactions...</div>
              ) : reactionData.length === 0 ? (
                <div className={styles.modalEmpty}>No reactions yet</div>
              ) : (
                <div className={styles.reactionList}>
                  {reactionData.map((reaction) => (
                    <div key={reaction.id} className={styles.reactionItem}>
                      <span className={styles.reactionAuthorName}>
                        {reaction.authorName || reaction.pubkey.slice(0, 8) + '...'}
                      </span>
                      <span className={styles.reactionContent}>
                        {reaction.content}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 