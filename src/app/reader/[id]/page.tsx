'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useBlog } from '@/contexts/BlogContext';
import type { BlogPost } from '@/contexts/BlogContext';
import ReactMarkdown from 'react-markdown';
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
      'wss://relay.primal.net',
      'wss://nostr.bitcoiner.social',
      'wss://relay.snort.social'
    ]
  });
};

export default function BlogPost() {
  const params = useParams();
  const { getPost, addPost, updateAuthorProfile, markPostAsRead } = useBlog();
  const { ndk: contextNdk, isAuthenticated } = useNostr();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [processedContent, setProcessedContent] = useState('');
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
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
        let postData = getPost(params.id as string);
        
        // Use context NDK if available, otherwise use standalone NDK
        const ndkToUse = contextNdk || standaloneNdk;
        
        // If post is not in context, fetch it directly from Nostr
        if (!postData && ndkToUse) {
          try {
            const event = await ndkToUse.fetchEvent({ ids: [params.id as string] });
            if (event) {
              const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
              const summary = event.tags.find(tag => tag[0] === 'summary')?.[1] || '';
              const published_at = parseInt(event.tags.find(tag => tag[0] === 'published_at')?.[1] || event.created_at.toString());
              const image = event.tags.find(tag => tag[0] === 'image')?.[1];
              const tags = event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]);

              postData = {
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

              // Only add post to context if user is authenticated (to avoid polluting local storage)
              if (isAuthenticated) {
                addPost(postData);
              }

              // Fetch author profile
              const user = ndkToUse.getUser({ pubkey: event.pubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                const authorProfile = {
                  name: profile.name,
                  displayName: profile.displayName
                };
                
                // Update post with author profile
                postData = { ...postData, author: authorProfile };
                
                // Only update context if authenticated
                if (isAuthenticated) {
                  updateAuthorProfile(event.pubkey, authorProfile);
                }
              }
            }
          } catch (error) {
            console.error('Error fetching post:', error);
          }
        }

        if (postData) {
          setPost(postData);
          // Process content to replace npubs with usernames
          if (ndkToUse) {
            const content = await processNpubs(postData.content, ndkToUse);
            setProcessedContent(content);
          } else {
            setProcessedContent(postData.content);
          }
        }
        setLoading(false);
      }
    };

    fetchPost();
  }, [params.id, getPost, contextNdk, standaloneNdk, isAuthenticated, addPost, updateAuthorProfile]);

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
          const user = ndk.getUser({ pubkey: decoded.data });
          const profile = await user.fetchProfile();
          if (profile) {
            const username = profile.displayName || profile.name || npubPart.slice(0, 8) + '...';
            const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
            processedContent = processedContent.replace(npub, njumpLink);
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
            <Link href="/reader" className={styles.backLink}>
              <ArrowLeftIcon className={styles.icon} />
              Back to reader
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        <Link href="/reader" className={styles.backLink}>
          <ArrowLeftIcon className={styles.icon} />
          Back to reader
        </Link>

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
            <ReactMarkdown
              components={{
                a: ({ ...props }) => {
                  const isNostrLink = props.href?.includes('njump.me');
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