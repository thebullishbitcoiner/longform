'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { resolveNip05, hexToNpub } from '@/utils/nostr';
import NDK from '@nostr-dev-kit/ndk';
import Link from 'next/link';
import { ArrowLeftIcon, UserIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
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

export default function ProfilePage() {
  const params = useParams();
  const { ndk: contextNdk, isAuthenticated } = useNostr();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);

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

          <div className={styles.postsSection}>
            <h2 className={styles.postsTitle}>
              Posts ({posts.length})
            </h2>
            
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
          </div>
        </div>
      </div>
    </div>
  );
} 