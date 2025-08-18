'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { resolveNip05, hexToNpub } from '@/utils/nostr';
import NDK from '@nostr-dev-kit/ndk';
import Link from 'next/link';
import { ArrowLeftIcon, UserIcon, ClipboardDocumentIcon, DocumentTextIcon, BookmarkIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import styles from './page.module.css';

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

interface UserProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  npub: string;
}

interface ProfilePost {
  id: string;
  title: string;
  summary: string;
  published_at: number;
  image?: string;
  tags: string[];
  dTag?: string;
}

interface ProfileHighlight {
  id: string;
  content: string;
  created_at: number;
  postId: string;
  postAuthor: string;
  postAuthorDisplayName?: string;
  postAuthorNip05?: string;
  postDTag?: string;
  startOffset?: number;
  endOffset?: number;
}

type TabType = 'posts' | 'highlights';

export default function ProfilePage() {
  const params = useParams();
  const { ndk: contextNdk, isAuthenticated } = useNostr();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [highlights, setHighlights] = useState<ProfileHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [jsonModal, setJsonModal] = useState<{ visible: boolean; data: Record<string, unknown> | null }>({
    visible: false,
    data: null
  });
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; highlightId: string | null; x: number; y: number }>({
    visible: false,
    highlightId: null,
    x: 0,
    y: 0
  });

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

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu.visible]);

  // Resolve identifier and fetch profile
  useEffect(() => {
    const loadProfile = async () => {
      if (!params.identifier) {
        setError('No identifier provided');
        setLoading(false);
        return;
      }

      const ndkToUse = contextNdk || standaloneNdk;
      if (!ndkToUse) {
        return; // Wait for NDK to be available
      }

      try {
        const identifier = decodeURIComponent(params.identifier as string);
        console.log('🔍 DEBUG: Loading profile for identifier:', identifier);

        // Resolve the identifier to a pubkey
        const pubkey = await resolveNip05(ndkToUse, identifier);
        
        if (!pubkey) {
          setError('Could not resolve user identifier');
          setLoading(false);
          return;
        }

        console.log('🔍 DEBUG: Resolved pubkey:', pubkey);

        // Fetch user profile
        const user = ndkToUse.getUser({ pubkey });
        const userProfile = await user.fetchProfile();
        
        const npub = hexToNpub(pubkey);
        if (!npub) {
          setError('Invalid public key');
          setLoading(false);
          return;
        }

        const profileData: UserProfile = {
          pubkey,
          npub,
          name: userProfile?.name,
          displayName: userProfile?.displayName,
          picture: userProfile?.image,
          about: userProfile?.bio,
          nip05: userProfile?.nip05,
        };

        setProfile(profileData);

        // Fetch user's blog posts (kind 30023)
        const postsQuery = await ndkToUse.fetchEvents({
          kinds: [30023],
          authors: [pubkey],
          limit: 50,
        });

        // Fetch deletion events (kind 5) to filter out deleted posts
        const deletionQuery = await ndkToUse.fetchEvents({
          kinds: [5],
          authors: [pubkey],
          limit: 100,
        });

        // Create a set of deleted event IDs
        const deletedEventIds = new Set<string>();
        deletionQuery.forEach(deletionEvent => {
          deletionEvent.tags.forEach((tag: string[]) => {
            if (tag[0] === 'e') {
              deletedEventIds.add(tag[1]);
            }
          });
        });

        console.log(`Profile: Deleted event IDs processed: ${Array.from(deletedEventIds).length}`);

        const allPosts = Array.from(postsQuery);
        console.log(`Profile: Found ${allPosts.length} total posts`);

        const profilePosts: ProfilePost[] = allPosts
          .filter(event => {
            // Filter out deleted posts
            const isDeleted = deletedEventIds.has(event.id);
            if (isDeleted) {
              console.log(`Profile: Removing deleted post: ${event.id}`);
            }
            return !isDeleted;
          })
          .map(event => {
            const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
            const summary = event.tags.find(tag => tag[0] === 'summary')?.[1] || '';
            const image = event.tags.find(tag => tag[0] === 'image')?.[1];
            const tags = event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]);
            const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];

            // event.created_at is always in seconds (Unix timestamp)
            const timestamp = event.created_at * 1000; // Convert seconds to milliseconds

            return {
              id: event.id,
              title,
              summary,
              published_at: timestamp,
              image,
              tags,
              dTag,
            };
          })
          .sort((a, b) => b.published_at - a.published_at);

        console.log(`Profile: Posts after filtering deletions: ${profilePosts.length}`);
        setPosts(profilePosts);

        // Fetch user's highlights (kind 9802)
        const highlightsQuery = await ndkToUse.fetchEvents({
          kinds: [9802],
          authors: [pubkey],
          limit: 100,
        });

        const highlightsArray = Array.from(highlightsQuery);
        console.log(`Profile: Found ${highlightsArray.length} highlights`);

        // Get unique author pubkeys from highlights
        const authorPubkeys = new Set<string>();
        highlightsArray.forEach(event => {
          const postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1];
          if (postAuthor) {
            authorPubkeys.add(postAuthor);
          }
        });

        // Fetch profiles for all authors
        const authorProfiles = new Map<string, { name?: string; displayName?: string; nip05?: string }>();
        for (const authorPubkey of authorPubkeys) {
          try {
            const authorUser = ndkToUse.getUser({ pubkey: authorPubkey });
            const authorProfile = await authorUser.fetchProfile();
            authorProfiles.set(authorPubkey, {
              name: authorProfile?.name,
              displayName: authorProfile?.displayName,
              nip05: authorProfile?.nip05,
            });
          } catch (error) {
            console.error(`Failed to fetch profile for author ${authorPubkey}:`, error);
          }
        }

        // Fetch the original posts to get their d tags
        const postIds = new Set<string>();
        highlightsArray.forEach(event => {
          const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
          if (postId) {
            postIds.add(postId);
          }
        });

        // Fetch the original posts to get their d tags
        const postsMap = new Map<string, { dTag?: string; author: string }>();
        if (postIds.size > 0) {
          const postsQuery = await ndkToUse.fetchEvents({
            kinds: [30023],
            ids: Array.from(postIds),
            limit: 100,
          });

          postsQuery.forEach(post => {
            const dTag = post.tags.find(tag => tag[0] === 'd')?.[1];
            postsMap.set(post.id, {
              dTag,
              author: post.pubkey,
            });
          });
        }

        const profileHighlights: ProfileHighlight[] = highlightsArray
          .map(event => {
            const postId = event.tags.find(tag => tag[0] === 'e')?.[1] || '';
            const postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1] || '';
            const startOffset = event.tags.find(tag => tag[0] === 'start')?.[1];
            const endOffset = event.tags.find(tag => tag[0] === 'end')?.[1];

            // Get author display name
            const authorProfile = authorProfiles.get(postAuthor);
            const postAuthorDisplayName = authorProfile?.displayName || authorProfile?.name || postAuthor.slice(0, 8) + '...';

            // Get post info for link generation
            const postInfo = postsMap.get(postId);

            return {
              id: event.id,
              content: event.content,
              created_at: event.created_at * 1000, // Convert seconds to milliseconds
              postId,
              postAuthor,
              postAuthorDisplayName,
              postAuthorNip05: authorProfile?.nip05,
              postDTag: postInfo?.dTag,
              startOffset: startOffset ? parseInt(startOffset) : undefined,
              endOffset: endOffset ? parseInt(endOffset) : undefined,
            };
          })
          .sort((a, b) => b.created_at - a.created_at);

        setHighlights(profileHighlights);

        setLoading(false);

      } catch (error) {
        console.error('Error loading profile:', error);
        setError('Failed to load profile');
        setLoading(false);
      }
    };

    loadProfile();
  }, [params.identifier, contextNdk, standaloneNdk]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <div className={styles.loading}>
            <div className={styles.loadingSpinner}></div>
            <p>Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <div className={styles.error}>
            <h1>Profile not found</h1>
            <p>{error || 'The requested profile could not be found.'}</p>
            {isAuthenticated && (
              <Link href="/" className={styles.backLink}>
                <ArrowLeftIcon className={styles.icon} />
                Back to home
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile.displayName || profile.name || profile.npub.slice(0, 8) + '...';

  const handleCopyNpub = async () => {
    try {
      await navigator.clipboard.writeText(profile.npub);
      // You could add a toast notification here if you want
    } catch (error) {
      console.error('Failed to copy npub:', error);
    }
  };

  const openHighlightJson = (highlight: ProfileHighlight) => {
    // Create a full Nostr event object from the highlight data
    const fullEvent = {
      id: highlight.id,
      pubkey: profile.pubkey,
      created_at: Math.floor(highlight.created_at / 1000), // Convert back to seconds
      kind: 9802,
      tags: [
        ['e', highlight.postId],
        ['p', highlight.postAuthor],
        ['client', 'Longform._']
      ],
      content: highlight.content,
      sig: '' // We don't have the signature in our highlight data
    };

    // Add position tags if available
    if (highlight.startOffset !== undefined) {
      fullEvent.tags.push(['start', highlight.startOffset.toString()]);
    }
    if (highlight.endOffset !== undefined) {
      fullEvent.tags.push(['end', highlight.endOffset.toString()]);
    }

    setJsonModal({ visible: true, data: fullEvent });
    setContextMenu({ visible: false, highlightId: null, x: 0, y: 0 });
  };

  const openContextMenu = (event: React.MouseEvent, highlightId: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Calculate position to keep menu on screen
    const menuWidth = 120; // Approximate menu width
    const menuHeight = 50; // Approximate menu height
    const padding = 10;
    
    let x = event.clientX;
    let y = event.clientY;
    
    // Adjust horizontal position to keep menu on screen
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (x < padding) {
      x = padding;
    }
    
    // Adjust vertical position to keep menu on screen
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
    }
    if (y < padding) {
      y = padding;
    }
    
    setContextMenu({
      visible: true,
      highlightId,
      x,
      y
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, highlightId: null, x: 0, y: 0 });
  };

  const renderPostsTab = () => (
    <>
      {posts.length === 0 ? (
        <div className={styles.noPosts}>
          <p>No posts found for this user.</p>
        </div>
      ) : (
        <div className={styles.postsGrid}>
          {posts.map((post) => (
            <Link 
              key={post.id} 
              href={`/reader/${encodeURIComponent(profile.nip05 || profile.npub)}/${post.dTag || post.id}`}
              className={styles.postCard}
            >
              {post.image && (
                <div className={styles.postImage}>
                  <Image 
                    src={post.image} 
                    alt={post.title}
                    width={400}
                    height={200}
                    className={styles.postImageContent}
                  />
                </div>
              )}
              <div className={styles.postContent}>
                <h3 className={styles.postTitle}>{post.title}</h3>
                {post.summary && (
                  <p className={styles.postSummary}>{post.summary}</p>
                )}
                <div className={styles.postMeta}>
                  <time className={styles.postDate}>
                    {new Date(post.published_at).toLocaleDateString()}
                  </time>
                  {post.tags.length > 0 && (
                    <div className={styles.postTags}>
                      {post.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className={styles.tag}>#{tag}</span>
                      ))}
                      {post.tags.length > 3 && (
                        <span className={styles.moreTags}>+{post.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );

  const renderHighlightsTab = () => (
    <>
      {highlights.length === 0 ? (
        <div className={styles.noHighlights}>
          <p>No highlights found for this user.</p>
        </div>
      ) : (
        <div className={styles.highlightsGrid}>
          {highlights.map((highlight) => {
            // Generate the correct link using NIP-05 and d tag
            const authorIdentifier = highlight.postAuthorNip05 || highlight.postAuthor;
            const postIdentifier = highlight.postDTag || highlight.postId;
            
            return (
              <Link 
                key={highlight.id} 
                href={`/reader/${encodeURIComponent(authorIdentifier)}/${postIdentifier}`}
                className={styles.highlightCard}
                onClick={(e) => {
                  // Don't navigate if clicking on the context menu
                  if ((e.target as HTMLElement).closest(`[data-context-menu]`)) {
                    e.preventDefault();
                  }
                }}
              >
                <div className={styles.highlightContent}>
                  <div className={styles.highlightHeader}>
                    <button 
                      className={styles.contextMenuButton}
                      onClick={(e) => openContextMenu(e, highlight.id)}
                      data-context-menu
                    >
                      <EllipsisVerticalIcon className={styles.contextMenuIcon} />
                    </button>
                  </div>
                  <blockquote className={styles.highlightText}>
                    &ldquo;{highlight.content}&rdquo;
                  </blockquote>
                  {highlight.postAuthorDisplayName && highlight.postAuthorDisplayName !== highlight.postAuthor.slice(0, 8) + '...' && (
                    <div className={styles.highlightAttribution}>
                      <span className={styles.highlightAuthor}>
                        — {highlight.postAuthorDisplayName}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div 
          className={styles.contextMenu}
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className={styles.contextMenuItem}
            onClick={() => {
              const highlight = highlights.find(h => h.id === contextMenu.highlightId);
              if (highlight) {
                openHighlightJson(highlight);
              }
            }}
          >
            View JSON
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        {isAuthenticated && (
          <Link href="/" className={styles.backLink}>
            <ArrowLeftIcon className={styles.icon} />
            Back to home
          </Link>
        )}

        <div className={styles.profile}>
          <div className={styles.profileHeader}>
            <div className={styles.profileImage}>
              {profile.picture ? (
                <Image 
                  src={profile.picture} 
                  alt={displayName}
                  width={120}
                  height={120}
                  className={styles.avatar}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove(styles.hidden);
                  }}
                />
              ) : null}
              {(!profile.picture || profile.picture === '') && (
                <div className={`${styles.avatarPlaceholder} ${profile.picture ? styles.hidden : ''}`}>
                  <UserIcon className={styles.placeholderIcon} />
                </div>
              )}
            </div>
            
            <div className={styles.profileInfo}>
              <h1 className={styles.profileName}>{displayName}</h1>
              <div className={styles.npubSection}>
                <span className={styles.npubValue}>{profile.npub}</span>
                <button 
                  onClick={handleCopyNpub}
                  className={styles.copyButton}
                  title="Copy npub"
                >
                  <ClipboardDocumentIcon className={styles.copyIcon} />
                </button>
              </div>
              {profile.nip05 && (
                <div className={styles.profileIdentifier}>
                  <span className={styles.identifierLabel}>NIP-05:</span>
                  <span className={styles.identifierValue}>{profile.nip05}</span>
                </div>
              )}
              {profile.about && (
                <p className={styles.profileBio}>{profile.about}</p>
              )}
            </div>
          </div>

          <div className={styles.tabsContainer}>
            <div className={styles.tabsHeader}>
              <button
                className={`${styles.tabButton} ${activeTab === 'posts' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('posts')}
              >
                <DocumentTextIcon className={styles.tabIcon} />
                Posts ({posts.length})
              </button>
              <button
                className={`${styles.tabButton} ${activeTab === 'highlights' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('highlights')}
              >
                <BookmarkIcon className={styles.tabIcon} />
                Highlights ({highlights.length})
              </button>
            </div>
            
            <div className={styles.tabContent}>
              {activeTab === 'posts' && renderPostsTab()}
              {activeTab === 'highlights' && renderHighlightsTab()}
            </div>
          </div>
        </div>
      </div>

      {/* JSON Modal */}
      {jsonModal.visible && (
        <div className={styles.modalOverlay} onClick={() => setJsonModal({ visible: false, data: null })}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Raw Event Data</h3>
              <button 
                className={styles.modalClose}
                onClick={() => setJsonModal({ visible: false, data: null })}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <pre className={styles.jsonDisplay}>
                {JSON.stringify(jsonModal.data, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 