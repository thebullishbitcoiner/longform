'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useBlog } from '@/contexts/BlogContext';
import type { BlogPost } from '@/contexts/BlogContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import styles from './page.module.css';
import { useNostr } from '@/contexts/NostrContext';
import { nip19 } from 'nostr-tools';
import NDK from '@nostr-dev-kit/ndk';

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

export default function BlogPost() {
  const params = useParams();
  const { getPost, addPost, updateAuthorProfile, markPostAsRead, getAuthorProfile, fetchProfileOnce } = useBlog();
  const { ndk: contextNdk, isAuthenticated } = useNostr();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [processedContent, setProcessedContent] = useState('');
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);
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

  useEffect(() => {
    const fetchPost = async () => {
      if (params.id) {
        // First, try to get post from context immediately
        const postData = getPost(params.id as string);
        
        if (postData) {
          // Show cached content immediately
          setPost(postData);
          setProcessedContent(postData.content);
          setLoading(false);
          
          // Load additional data in background
          setIsLoadingAdditionalData(true);
          await loadAdditionalData(postData);
          setIsLoadingAdditionalData(false);
        } else {
          // Post not in context, fetch it
          await fetchPostFromNostr();
        }
      }
    };

    fetchPost();
  }, [params.id, getPost, contextNdk, standaloneNdk, isAuthenticated, addPost, updateAuthorProfile, fetchProfileOnce, getAuthorProfile]);

  const loadAdditionalData = async (postData: BlogPost) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    try {
      // Process content to replace npubs with usernames
      const content = await processNpubs(postData.content, ndkToUse);
      setProcessedContent(content);
      
      // Fetch author profile if not already available
      if (!postData.author) {
        // Check if we already have this profile cached
        const cachedProfile = getAuthorProfile(postData.pubkey);
        if (cachedProfile) {
          console.log('👤 DEBUG: Using cached profile for:', postData.pubkey);
          const updatedPost = { ...postData, author: cachedProfile };
          setPost(updatedPost);
        } else {
          console.log('👤 DEBUG: Fetching profile for blog post:', postData.pubkey);
          const profile = await fetchProfileOnce(postData.pubkey, async () => {
            const user = ndkToUse.getUser({ pubkey: postData.pubkey });
            const profile = await user.fetchProfile();
            if (profile) {
              return {
                name: profile.name,
                displayName: profile.displayName
              };
            }
            return null;
          });
          
          if (profile) {
            const updatedPost = { ...postData, author: profile };
            setPost(updatedPost);
          }
        }
      }
    } catch (error) {
      console.error('Error loading additional data:', error);
    }
  };

  const fetchPostFromNostr = async () => {
    const ndkToUse = contextNdk || standaloneNdk;
    
    if (!ndkToUse) {
      setLoading(false);
      return;
    }

    try {
      const event = await ndkToUse.fetchEvent({ ids: [params.id as string] });
      if (event) {
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

        // Show content immediately
        setPost(postData);
        setProcessedContent(event.content);
        setLoading(false);

        // Load additional data in background
        setIsLoadingAdditionalData(true);
        await loadAdditionalData(postData);
        setIsLoadingAdditionalData(false);

        // Only add post to context if user is authenticated (to avoid polluting local storage)
        if (isAuthenticated) {
          addPost(postData);
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching post:', error);
      setLoading(false);
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

  const processNpubs = async (content: string, ndk: NDK) => {
    let processedContent = content;

    // First process npubs
    const npubRegex = /nostr:npub1[a-zA-Z0-9]+/g;
    const npubs = content.match(npubRegex) || [];
    
    for (const npub of npubs) {
      try {
        const npubPart = npub.replace('nostr:', '');
        const decoded = nip19.decode(npubPart);
        if (decoded.type === 'npub') {
          const pubkey = decoded.data;
          
          // Check if we already have this profile cached
          const cachedProfile = getAuthorProfile(pubkey);
          if (cachedProfile) {
            const username = cachedProfile.displayName || cachedProfile.name || npubPart.slice(0, 8) + '...';
            const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
            processedContent = processedContent.replace(npub, njumpLink);
          } else {
            // Use the centralized profile fetching to prevent duplicates
            const profile = await fetchProfileOnce(pubkey, async () => {
              const user = ndk.getUser({ pubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                return {
                  name: profile.name,
                  displayName: profile.displayName
                };
              }
              return null;
            });
            
            if (profile) {
              const username = profile.displayName || profile.name || npubPart.slice(0, 8) + '...';
              const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
              processedContent = processedContent.replace(npub, njumpLink);
            } else {
              // Use a placeholder if profile fetch failed
              const username = npubPart.slice(0, 8) + '...';
              const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
              processedContent = processedContent.replace(npub, njumpLink);
            }
          }
        }
      } catch (error) {
        console.error('Error processing npub:', error);
      }
    }

    // Then process any remaining plain URLs that aren't already in markdown format
    const urlRegex = /(?<![\[\(])(https?:\/\/[^\s]+)(?![\]\)])/g;
    processedContent = processedContent.replace(urlRegex, (match) => {
      return `[${match}](${match})`;
    });
    
    return processedContent;
  };

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
              <img src={post.image} alt={post.title} />
            </div>
          )}

          <header className={styles.header}>
            <h1 className={styles.title}>{post.title}</h1>
            <div className={styles.metadata}>
              <div className={styles.author}>
                <span className={styles.label}>Author:</span>
                <span className={styles.authorValue}>
                  {post.author?.displayName || post.author?.name || post.pubkey.slice(0, 8) + '...'}
                </span>
                {isLoadingAdditionalData && !post.author && (
                  <span className={styles.loadingIndicator}> (loading...)</span>
                )}
              </div>
              <div className={styles.date}>
                <span className={styles.label}>Published:</span>
                <time>{new Date(post.created_at * 1000).toLocaleDateString()}</time>
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
    </div>
  );
} 