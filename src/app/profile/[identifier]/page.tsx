'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/config/supabase';
import { getLongformProfile } from '@/utils/supabase';
import { resolveNip05, hexToNpub } from '@/utils/nostr';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import Link from 'next/link';
import { ArrowLeftIcon, UserIcon, ClipboardDocumentIcon, DocumentTextIcon, PencilIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import styles from './page.module.css';
import { getCachedHighlights, cacheUserHighlights, getCachedPosts, cacheUserPosts } from '@/utils/storage';
import { hexToNote1 } from '@/utils/nostr';
import toast from 'react-hot-toast';
import { useBlog } from '@/contexts/BlogContext';
import { DEFAULT_RELAYS } from '@/config/relays';
import JsonModal from '@/components/JsonModal';
import ConfirmModal from '@/components/ConfirmModal';
import { useHighlights } from '@/utils/highlights';

// Create a standalone NDK instance for public access
const createStandaloneNDK = () => {
  return new NDK({
    explicitRelayUrls: DEFAULT_RELAYS
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
  event?: NDKEvent; // Store the original NDKEvent for JSON viewing
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
  event?: NDKEvent; // Store the original NDKEvent for JSON viewing
}

type TabType = 'posts' | 'highlights';

export default function ProfilePage() {
  const params = useParams();
  const { ndk: contextNdk, isAuthenticated, currentUser } = useNostr();
  const { getAuthorProfile, fetchProfileOnce } = useBlog();
  const { checkProStatus, checkLegendStatus } = useSupabase();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [highlights, setHighlights] = useState<ProfileHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [jsonModal, setJsonModal] = useState<{ visible: boolean; data: Record<string, unknown> | null }>({
    visible: false,
    data: null
  });
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; highlightId: string | null; postId: string | null; x: number; y: number }>({
    visible: false,
    highlightId: null,
    postId: null,
    x: 0,
    y: 0
  });
  const [isProfilePro, setIsProfilePro] = useState(false);
  const [isProfileLegend, setIsProfileLegend] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [profileBackground, setProfileBackground] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  // Use highlights hook for deletion functionality only (disable auto-fetch since we fetch profile highlights separately)
  const { deleteHighlight } = useHighlights({ autoFetch: false });

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

  // Close context menu when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    };

    const handleScroll = () => {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [contextMenu.visible]);

  // Load highlights data when highlights tab is activated
  const loadHighlights = async () => {
    if (highlightsLoaded || highlightsLoading || !profile) return;

    setHighlightsLoading(true);
    const ndkToUse = contextNdk || standaloneNdk;
    
    if (!ndkToUse) {
      setHighlightsLoading(false);
      return;
    }

    try {
      // Check cache first
      const cachedHighlights = getCachedHighlights(profile.pubkey);
      if (cachedHighlights && cachedHighlights.length > 0) {
        console.log(`Profile: Using cached highlights (${cachedHighlights.length} items)`);
        
                 // Convert cached highlights to ProfileHighlight format (without author info initially)
         const profileHighlights = cachedHighlights.map(highlight => ({
           id: highlight.id,
           content: highlight.content,
           created_at: highlight.created_at,
           postId: highlight.postId,
           postAuthor: highlight.postAuthor,
           postAuthorDisplayName: undefined,
           postAuthorNip05: highlight.postAuthorNip05,
           postDTag: highlight.postDTag,
           event: undefined // Don't create synthetic events for cached highlights
         })).sort((a, b) => b.created_at - a.created_at);
        
        setHighlights(profileHighlights);
        setHighlightsLoaded(true);
        setHighlightsLoading(false);
        
                 // Background fetch author info for cached highlights progressively
         setTimeout(async () => {
           try {
             const authorPubkeys = new Set<string>();
             cachedHighlights.forEach(highlight => {
               if (highlight.postAuthor) {
                 authorPubkeys.add(highlight.postAuthor);
               }
             });

                           // Fetch profiles progressively using the existing cached system, prioritizing recent highlights
              const fetchCachedAuthorProfile = async (authorPubkey: string) => {
                // Check if already cached
                let cachedProfile = getAuthorProfile(authorPubkey);
                if (!cachedProfile) {
                  // Fetch and cache the profile
                  await fetchProfileOnce(authorPubkey, async () => {
                    const authorUser = ndkToUse.getUser({ pubkey: authorPubkey });
                    const profile = await authorUser.fetchProfile();
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
                  // Get the profile again after caching
                  cachedProfile = getAuthorProfile(authorPubkey);
                }
                
                // Update highlights for this author immediately
                if (cachedProfile) {
                  setHighlights(prevHighlights => 
                    prevHighlights.map(highlight => {
                      if (highlight.postAuthor === authorPubkey) {
                        const postAuthorDisplayName = cachedProfile?.displayName || cachedProfile?.name || authorPubkey.slice(0, 8) + '...';
                        return {
                          ...highlight,
                          postAuthorDisplayName,
                          postAuthorNip05: cachedProfile?.nip05,
                        };
                      }
                      return highlight;
                    })
                  );
                }
              };
              
              // Sort author pubkeys by their highlight recency (most recent first)
              const authorPubkeysByRecency = Array.from(authorPubkeys).sort((a, b) => {
                // Find the most recent highlight for each author
                const aHighlights = cachedHighlights.filter(h => h.postAuthor === a);
                const bHighlights = cachedHighlights.filter(h => h.postAuthor === b);
                
                const aMostRecent = Math.max(...aHighlights.map(h => h.created_at));
                const bMostRecent = Math.max(...bHighlights.map(h => h.created_at));
                
                return bMostRecent - aMostRecent; // Most recent first
              });
              
              // Fetch author profiles sequentially, starting with most recent
              for (const authorPubkey of authorPubkeysByRecency) {
                await fetchCachedAuthorProfile(authorPubkey);
              }
             
             console.log(`Profile: Updated cached highlights with author info for ${authorPubkeys.size} authors`);
           } catch (error) {
             console.error('Error fetching author profiles for cached highlights:', error);
           }
         }, 100); // Small delay to ensure UI shows immediately
        
        return;
      }

      // Fetch user's highlights (kind 9802) if no cache available
      console.log(`Profile: Fetching highlights from network for ${profile.pubkey}`);
      const highlightsQuery = await ndkToUse.fetchEvents({
        kinds: [9802],
        authors: [profile.pubkey],
        limit: 100,
      });

      const highlightsArray = Array.from(highlightsQuery);
      console.log(`Profile: Found ${highlightsArray.length} highlights`);

      // Update count immediately when we get the raw highlights
      setHighlights(() => {
        const tempHighlights = highlightsArray.map(event => {
          // Parse the "a" tag to get author pubkey and d tag
          const aTag = event.tags.find(tag => tag[0] === 'a')?.[1];
          let postAuthor = '';
          let postDTag = '';
          
          if (aTag) {
            // Parse "a" tag format: "kind:author_pubkey:d_tag"
            const aTagParts = aTag.split(':');
            if (aTagParts.length >= 3) {
              postAuthor = aTagParts[1]; // author pubkey
              postDTag = aTagParts[2];   // d tag
            }
          }
          
          // Fallback to "p" tag if "a" tag parsing fails
          if (!postAuthor) {
            postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1] || '';
          }
          
          return {
            id: event.id,
            content: event.content,
            created_at: event.created_at * 1000,
            postId: event.tags.find(tag => tag[0] === 'e')?.[1] || '', // Keep e tag for backward compatibility
            postAuthor,
            postAuthorDisplayName: undefined,
            postAuthorNip05: undefined,
            postDTag,
            startOffset: event.tags.find(tag => tag[0] === 'start')?.[1] ? parseInt(event.tags.find(tag => tag[0] === 'start')?.[1] || '0') : undefined,
            endOffset: event.tags.find(tag => tag[0] === 'end')?.[1] ? parseInt(event.tags.find(tag => tag[0] === 'end')?.[1] || '0') : undefined,
            event: event, // Store the original NDKEvent
          };
        });
        return tempHighlights.sort((a, b) => b.created_at - a.created_at);
      });

      // Get unique author pubkeys from highlights
      const authorPubkeys = new Set<string>();
      highlightsArray.forEach(event => {
        // Try to get author from "a" tag first
        const aTag = event.tags.find(tag => tag[0] === 'a')?.[1];
        let postAuthor = '';
        
        if (aTag) {
          const aTagParts = aTag.split(':');
          if (aTagParts.length >= 3) {
            postAuthor = aTagParts[1]; // author pubkey from a tag
          }
        }
        
        // Fallback to "p" tag if "a" tag parsing fails
        if (!postAuthor) {
          postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1] || '';
        }
        
        if (postAuthor) {
          authorPubkeys.add(postAuthor);
        }
      });

                     // Fetch profiles for all authors progressively, prioritizing recent highlights
        const authorProfiles = new Map<string, { name?: string; displayName?: string; nip05?: string; image?: string; picture?: string }>();
        const fetchAuthorProfile = async (authorPubkey: string) => {
          try {
            const authorUser = ndkToUse.getUser({ pubkey: authorPubkey });
            const authorProfile = await authorUser.fetchProfile();
            const profileData = {
              name: authorProfile?.name,
              displayName: authorProfile?.displayName,
              nip05: authorProfile?.nip05,
              image: authorProfile?.image,
              picture: authorProfile?.picture
            };
            authorProfiles.set(authorPubkey, profileData);
            
            // Update highlights for this author immediately
            setHighlights(prevHighlights => 
              prevHighlights.map(highlight => {
                if (highlight.postAuthor === authorPubkey) {
                  const postAuthorDisplayName = profileData.displayName || profileData.name || authorPubkey.slice(0, 8) + '...';
                  return {
                    ...highlight,
                    postAuthorDisplayName,
                    postAuthorNip05: profileData.nip05,
                  };
                }
                return highlight;
              })
            );
          } catch (error) {
            console.error(`Failed to fetch profile for author ${authorPubkey}:`, error);
          }
        };
        
        // Sort author pubkeys by their highlight recency (most recent first)
        const authorPubkeysByRecency = Array.from(authorPubkeys).sort((a, b) => {
          // Find the most recent highlight for each author
          const aHighlights = highlightsArray.filter(event => {
            const postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1];
            return postAuthor === a;
          });
          const bHighlights = highlightsArray.filter(event => {
            const postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1];
            return postAuthor === b;
          });
          
          const aMostRecent = Math.max(...aHighlights.map(h => h.created_at));
          const bMostRecent = Math.max(...bHighlights.map(h => h.created_at));
          
          return bMostRecent - aMostRecent; // Most recent first
        });
        
        // Fetch author profiles sequentially, starting with most recent
        for (const authorPubkey of authorPubkeysByRecency) {
          await fetchAuthorProfile(authorPubkey);
        }

      // Now update with full data using "a" tag information
      const profileHighlights: ProfileHighlight[] = highlightsArray
        .map(event => {
          // Parse the "a" tag to get author pubkey and d tag
          const aTag = event.tags.find(tag => tag[0] === 'a')?.[1];
          let postAuthor = '';
          let postDTag = '';
          
          if (aTag) {
            // Parse "a" tag format: "kind:author_pubkey:d_tag"
            const aTagParts = aTag.split(':');
            if (aTagParts.length >= 3) {
              postAuthor = aTagParts[1]; // author pubkey
              postDTag = aTagParts[2];   // d tag
            }
          }
          
          // Fallback to "p" tag if "a" tag parsing fails
          if (!postAuthor) {
            postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1] || '';
          }
          
          const postId = event.tags.find(tag => tag[0] === 'e')?.[1] || ''; // Keep for backward compatibility

          // Get author display name
          const authorProfile = authorProfiles.get(postAuthor);
          const postAuthorDisplayName = authorProfile?.displayName || authorProfile?.name || postAuthor.slice(0, 8) + '...';

          return {
            id: event.id,
            content: event.content,
            created_at: event.created_at * 1000, // Convert seconds to milliseconds
            postId,
            postAuthor,
            postAuthorDisplayName,
            postAuthorNip05: authorProfile?.nip05,
            postDTag,
            event: event, // Store the original NDKEvent
          };
        })
        .sort((a, b) => b.created_at - a.created_at);

      console.log('Profile: Updating highlights with full data:', profileHighlights.length, 'highlights');
      console.log('Profile: Sample highlight with author data:', profileHighlights[0]);
      
                    // Cache the highlights for faster future loading
        const highlightsForCache = profileHighlights.map(highlight => ({
          id: highlight.id,
          content: highlight.content,
          created_at: highlight.created_at,
          postId: highlight.postId,
          postAuthor: highlight.postAuthor,
          postAuthorNip05: highlight.postAuthorNip05,
          postDTag: highlight.postDTag,
          eventTags: highlight.event?.tags || [], // Store the original event tags
          eventData: highlight.event ? {
            id: highlight.event.id,
            pubkey: highlight.event.pubkey,
            created_at: highlight.event.created_at || 0,
            kind: highlight.event.kind || 9802,
            tags: highlight.event.tags || [],
            content: highlight.event.content || '',
            sig: highlight.event.sig || ''
          } : undefined // Store the complete event data for JSON viewing
        }));
      cacheUserHighlights(profile.pubkey, highlightsForCache);
      console.log(`Profile: Cached ${highlightsForCache.length} highlights for future use`);
      
      setHighlights(profileHighlights);
      setHighlightsLoaded(true);
    } catch (error) {
      console.error('Error loading highlights:', error);
    } finally {
      setHighlightsLoading(false);
    }
  };

  // Handle tab change
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // Load highlights in background after initial page load
  useEffect(() => {
    if (profile && !highlightsLoaded && !highlightsLoading) {
      // Use setTimeout to ensure this runs after the initial render
      const timer = setTimeout(() => {
        loadHighlights();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [profile, highlightsLoaded, highlightsLoading]);

  // Function to fetch and cache posts
  const fetchAndCachePosts = async (ndkToUse: NDK, pubkey: string) => {
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
          event: event, // Store the original NDKEvent
        };
      })
      .sort((a, b) => b.published_at - a.published_at);

    console.log(`Profile: Posts after filtering deletions: ${profilePosts.length}`);
    
    // Cache the posts for faster future loading
    const postsForCache = profilePosts.map(post => ({
      id: post.id,
      title: post.title,
      summary: post.summary,
      published_at: post.published_at,
      image: post.image,
      tags: post.tags,
      dTag: post.dTag,
      eventData: post.event ? {
        id: post.event.id,
        pubkey: post.event.pubkey,
        created_at: post.event.created_at || 0,
        kind: post.event.kind || 30023,
        tags: post.event.tags || [],
        content: post.event.content || '',
        sig: post.event.sig || ''
      } : undefined // Store the complete event data for JSON viewing
    }));
    cacheUserPosts(pubkey, postsForCache);
    console.log(`Profile: Cached ${postsForCache.length} posts for future use`);
    
    setPosts(profilePosts);
  };

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

      // Reset states when loading a new profile
      setLoading(true);
      setError(null);
      setIsProfilePro(false);
      setIsProfileLegend(false);
      setPosts([]);
      setHighlights([]);
      setHighlightsLoaded(false);

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

        // Check PRO status for this profile (using the profile's npub)
        let isPro = false;
        try {
          console.log('🔍 DEBUG: Checking PRO status for npub:', npub);
          const proStatus = await checkProStatus(npub);
          console.log('🔍 DEBUG: PRO status result:', proStatus);
          isPro = proStatus.isPro;
          setIsProfilePro(isPro);
        } catch (error) {
          console.error('Error checking PRO status:', error);
          setIsProfilePro(false);
        }

        // Check Legend status for this profile (using the profile's npub)
        let isLegend = false;
        try {
          console.log('🔍 DEBUG: Checking Legend status for npub:', npub);
          isLegend = await checkLegendStatus(npub);
          console.log('🔍 DEBUG: Legend status result:', isLegend);
          setIsProfileLegend(isLegend);
        } catch (error) {
          console.error('Error checking Legend status:', error);
          setIsProfileLegend(false);
        }

        // Fetch profile customizations (only for PRO/Legend users)
        if (isPro || isLegend) {
          try {
            const longformProfile = await getLongformProfile(npub);
            if (longformProfile?.background) {
              setProfileBackground(longformProfile.background);
            }
          } catch (error) {
            console.error('Error fetching profile customizations:', error);
          }
        }

        // Check cache first for posts
        const cachedPosts = getCachedPosts(pubkey);
        if (cachedPosts && cachedPosts.length > 0) {
          console.log(`Profile: Using cached posts (${cachedPosts.length} items)`);
          
          // Convert cached posts to ProfilePost format
          const profilePosts = cachedPosts.map(post => ({
            id: post.id,
            title: post.title,
            summary: post.summary,
            published_at: post.published_at,
            image: post.image,
            tags: post.tags,
            dTag: post.dTag,
            event: undefined // Don't create synthetic events for cached posts
          })).sort((a, b) => b.published_at - a.published_at);
          
          setPosts(profilePosts);
          
          // Background fetch to refresh cache
          setTimeout(async () => {
            try {
              await fetchAndCachePosts(ndkToUse, pubkey);
            } catch (error) {
              console.error('Error refreshing post cache:', error);
            }
          }, 100);
        } else {
          // Fetch posts from network if no cache available
          await fetchAndCachePosts(ndkToUse, pubkey);
        }

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
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading profile...</p>
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

  const handleCopyNoteId = async (noteId: string) => {
    try {
      // Convert hex to note1 format
      const note1Id = hexToNote1(noteId);
      const textToCopy = note1Id || noteId; // Fallback to hex if conversion fails
      
      await navigator.clipboard.writeText(textToCopy);
      toast.success('Note ID copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy note ID:', error);
      toast.error('Failed to copy note ID');
    }
  };

  const handleSubscribe = async () => {
    if (!isAuthenticated || !currentUser?.npub || !profile) {
      toast.error('Please log in to subscribe');
      return;
    }

    setIsSubscribing(true);
    try {
      const action = isSubscribed ? 'unsubscribe' : 'subscribe';
      
      const { error } = await supabase
        .from('action_queue')
        .insert({
          author: profile.npub,
          reader: currentUser.npub,
          action: action,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error(`Error creating ${action} request:`, error);
        // Check if it's a duplicate key error (user already has pending request)
        if (error.code === '23505') {
          // If already subscribed and trying to unsubscribe, or vice versa
          setIsSubscribed(!isSubscribed);
        } else {
          toast.error(`Failed to ${action}. Please try again.`);
        }
        return;
      }

      setIsSubscribed(!isSubscribed);
    } catch (error) {
      console.error('Error with subscription action:', error);
      toast.error('Failed to process request. Please try again.');
    } finally {
      setIsSubscribing(false);
    }
  };

  const openHighlightJson = async (highlight: ProfileHighlight) => {
    if (highlight.event) {
      // Use the actual NDKEvent if available
      const fullEvent = {
        id: highlight.event.id,
        pubkey: highlight.event.pubkey,
        created_at: highlight.event.created_at,
        kind: highlight.event.kind,
        tags: highlight.event.tags,
        content: highlight.event.content,
        sig: highlight.event.sig
      };
      setJsonModal({ visible: true, data: fullEvent });
    } else {
      // Check if we have cached event data first
      const cachedHighlights = getCachedHighlights(profile.pubkey);
      const cachedHighlight = cachedHighlights?.find(h => h.id === highlight.id);
      
      if (cachedHighlight?.eventData) {
        // Use cached event data
        console.log('Using cached event data for highlight:', highlight.id);
        setJsonModal({ visible: true, data: cachedHighlight.eventData });
      } else {
        // For cached highlights without original event, try to fetch it from the network
        try {
          console.log('Attempting to fetch original highlight event:', highlight.id);
          const ndkToUse = contextNdk || standaloneNdk;
          if (ndkToUse) {
            // Try to fetch the original event by ID
            const originalEvent = await ndkToUse.fetchEvent(highlight.id);
            if (originalEvent) {
              console.log('Successfully fetched original highlight event');
              const fullEvent = {
                id: originalEvent.id,
                pubkey: originalEvent.pubkey,
                created_at: originalEvent.created_at,
                kind: originalEvent.kind,
                tags: originalEvent.tags,
                content: originalEvent.content,
                sig: originalEvent.sig
              };
              setJsonModal({ visible: true, data: fullEvent });
            } else {
              // Show cached data if original event not found
              const simplifiedEvent = {
                id: highlight.id,
                content: highlight.content,
                postId: highlight.postId,
                postAuthor: highlight.postAuthor,
                created_at: Math.floor(highlight.created_at / 1000),
                note: 'Original event not found on network. Showing cached data.'
              };
              setJsonModal({ visible: true, data: simplifiedEvent });
            }
          } else {
            // No NDK available, show cached data
            const simplifiedEvent = {
              id: highlight.id,
              content: highlight.content,
              postId: highlight.postId,
              postAuthor: highlight.postAuthor,
              created_at: Math.floor(highlight.created_at / 1000),
              note: 'No network connection available. Showing cached data.'
            };
            setJsonModal({ visible: true, data: simplifiedEvent });
          }
        } catch (error) {
          console.error('Error fetching original highlight event:', error);
          // Show cached data if fetch fails
          const simplifiedEvent = {
            id: highlight.id,
            content: highlight.content,
            postId: highlight.postId,
            postAuthor: highlight.postAuthor,
            created_at: Math.floor(highlight.created_at / 1000),
            note: 'Error fetching original event. Showing cached data.'
          };
          setJsonModal({ visible: true, data: simplifiedEvent });
        }
      }
    }
    setContextMenu({ visible: false, highlightId: null, postId: null, x: 0, y: 0 });
  };

  const openPostJson = async (post: ProfilePost) => {
    if (post.event) {
      // Use the actual NDKEvent if available
      const fullEvent = {
        id: post.event.id,
        pubkey: post.event.pubkey,
        created_at: post.event.created_at,
        kind: post.event.kind,
        tags: post.event.tags,
        content: post.event.content,
        sig: post.event.sig
      };
      setJsonModal({ visible: true, data: fullEvent });
    } else {
      // Check if we have cached event data first
      const cachedPosts = getCachedPosts(profile.pubkey);
      const cachedPost = cachedPosts?.find(p => p.id === post.id);
      
      if (cachedPost?.eventData) {
        // Use cached event data
        console.log('Using cached event data for post:', post.id);
        setJsonModal({ visible: true, data: cachedPost.eventData });
      } else {
        // For cached posts without original event, try to fetch it from the network
        try {
          console.log('Attempting to fetch original post event:', post.id);
          const ndkToUse = contextNdk || standaloneNdk;
          if (ndkToUse) {
            // Try to fetch the original event by ID
            const originalEvent = await ndkToUse.fetchEvent(post.id);
            if (originalEvent) {
              console.log('Successfully fetched original post event');
              const fullEvent = {
                id: originalEvent.id,
                pubkey: originalEvent.pubkey,
                created_at: originalEvent.created_at,
                kind: originalEvent.kind,
                tags: originalEvent.tags,
                content: originalEvent.content,
                sig: originalEvent.sig
              };
              setJsonModal({ visible: true, data: fullEvent });
            } else {
              // Show cached data if original event not found
              const simplifiedEvent = {
                id: post.id,
                pubkey: profile.pubkey,
                created_at: Math.floor(post.published_at / 1000),
                kind: 30023,
                tags: [
                  ['d', post.dTag || post.id],
                  ['title', post.title],
                  ['summary', post.summary],
                  ['client', 'Longform._'],
                  ...(post.image ? [['image', post.image]] : []),
                  ...post.tags.map(tag => ['t', tag])
                ],
                content: '',
                sig: '',
                note: 'Original event not found on network. Showing cached data.'
              };
              setJsonModal({ visible: true, data: simplifiedEvent });
            }
          } else {
            // No NDK available, show cached data
            const simplifiedEvent = {
              id: post.id,
              pubkey: profile.pubkey,
              created_at: Math.floor(post.published_at / 1000),
              kind: 30023,
              tags: [
                ['d', post.dTag || post.id],
                ['title', post.title],
                ['summary', post.summary],
                ['client', 'Longform._'],
                ...(post.image ? [['image', post.image]] : []),
                ...post.tags.map(tag => ['t', tag])
              ],
              content: '',
              sig: '',
              note: 'No network connection available. Showing cached data.'
            };
            setJsonModal({ visible: true, data: simplifiedEvent });
          }
        } catch (error) {
          console.error('Error fetching original post event:', error);
          // Show cached data if fetch fails
          const simplifiedEvent = {
            id: post.id,
            pubkey: profile.pubkey,
            created_at: Math.floor(post.published_at / 1000),
            kind: 30023,
            tags: [
              ['d', post.dTag || post.id],
              ['title', post.title],
              ['summary', post.summary],
              ['client', 'Longform._'],
              ...(post.image ? [['image', post.image]] : []),
              ...post.tags.map(tag => ['t', tag])
            ],
            content: '',
            sig: '',
            note: 'Error fetching original event. Showing cached data.'
          };
          setJsonModal({ visible: true, data: simplifiedEvent });
        }
      }
    }
    setContextMenu({ visible: false, highlightId: null, postId: null, x: 0, y: 0 });
  };

  const openHighlightContextMenu = (event: React.MouseEvent, highlightId: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Calculate position to keep menu on screen
    const menuWidth = 140; // Increased menu width
    const menuHeight = 120; // Increased menu height for multiple items
    const padding = 10;
    const buttonOffset = 10; // Reduced offset to position menu closer to the button
    
    let x = event.clientX;
    let y = event.clientY + buttonOffset; // Position below the button
    
    // Adjust horizontal position to keep menu on screen
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (x < padding) {
      x = padding;
    }
    
    // Adjust vertical position to keep menu on screen
    if (y + menuHeight > window.innerHeight - padding) {
      y = event.clientY - menuHeight - buttonOffset; // Position above the button if not enough space below
    }
    if (y < padding) {
      y = padding;
    }
    
    setContextMenu({
      visible: true,
      highlightId,
      postId: null,
      x,
      y
    });
  };

  const openPostContextMenu = (event: React.MouseEvent, postId: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Calculate position to keep menu on screen
    const menuWidth = 140; // Increased menu width
    const menuHeight = 120; // Increased menu height for multiple items
    const padding = 10;
    const buttonOffset = 10; // Reduced offset to position menu closer to the button
    
    let x = event.clientX;
    let y = event.clientY + buttonOffset; // Position below the button
    
    // Adjust horizontal position to keep menu on screen
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (x < padding) {
      x = padding;
    }
    
    // Adjust vertical position to keep menu on screen
    if (y + menuHeight > window.innerHeight - padding) {
      y = event.clientY - menuHeight - buttonOffset; // Position above the button if not enough space below
    }
    if (y < padding) {
      y = padding;
    }
    
    setContextMenu({
      visible: true,
      highlightId: null,
      postId,
      x,
      y
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, highlightId: null, postId: null, x: 0, y: 0 });
  };

  const handleDeleteHighlight = (highlightId: string) => {
    const highlight = highlights.find(h => h.id === highlightId);
    if (!highlight) return;

    setConfirmModal({
      isOpen: true,
      title: 'Delete Highlight',
      message: `Are you sure you want to delete this highlight? This action cannot be undone.`,
      onConfirm: () => performDeleteHighlight(highlightId)
    });
  };

  const performDeleteHighlight = async (highlightId: string) => {
    try {
      const success = await deleteHighlight(highlightId);
      if (success) {
        // Remove from local state
        setHighlights(prev => prev.filter(h => h.id !== highlightId));
        toast.success('Highlight deleted successfully');
      } else {
        toast.error('Failed to delete highlight');
      }
    } catch (error) {
      console.error('Error deleting highlight:', error);
      toast.error('Failed to delete highlight');
    }
  };

  const handleConfirmModalClose = () => {
    setConfirmModal({
      isOpen: false,
      title: '',
      message: '',
      onConfirm: null
    });
  };

  const handleConfirmModalConfirm = () => {
    if (confirmModal.onConfirm) {
      confirmModal.onConfirm();
    }
    handleConfirmModalClose();
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
            <div key={post.id} className={styles.postCardWrapper}>
              <Link 
                href={`/reader/${encodeURIComponent(profile.nip05 || profile.npub)}/${post.dTag || post.id}`}
                className={styles.postCard}
                onClick={(e) => {
                  // Don't navigate if clicking on the context menu
                  if ((e.target as HTMLElement).closest(`[data-context-menu]`)) {
                    e.preventDefault();
                  }
                }}
              >
                {post.image && (
                  <div className={styles.postImage}>
                    <Image 
                      src={post.image} 
                      alt={post.title}
                      width={400}
                      height={200}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 400px"
                      className={styles.postImageContent}
                    />
                  </div>
                )}
                <div className={styles.postContent}>
                  <div className={styles.postHeader}>
                    <button 
                      className={styles.contextMenuButton}
                      onClick={(e) => openPostContextMenu(e, post.id)}
                      data-context-menu
                    >
                      <EllipsisVerticalIcon className={styles.contextMenuIcon} />
                    </button>
                  </div>
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
            </div>
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
          // Generate the correct link using data from "a" tag (author pubkey and d tag)
          // This is more reliable than using "e" tag which can become incorrect
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
                    onClick={(e) => openHighlightContextMenu(e, highlight.id)}
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
    </>
  );


  return (
    <div 
      className={styles.container}
      style={profileBackground ? {
        backgroundImage: `url(${profileBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      } as React.CSSProperties : undefined}
    >
      <div className={styles.mainContent}>
        <div className={styles.profile}>
          <div className={styles.profileHeader}>
            <div className={styles.profileImage}>
              {profile.picture ? (
                <Image 
                  src={profile.picture} 
                  alt={displayName}
                  width={120}
                  height={120}
                  sizes="(max-width: 768px) 80px, 120px"
                  className={`${styles.avatar} ${isProfileLegend ? styles.legendAvatar : ''}`}
                  unoptimized
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove(styles.hidden);
                  }}
                />
              ) : null}
              {(!profile.picture || profile.picture === '') && (
                <div className={`${styles.avatarPlaceholder} ${profile.picture ? styles.hidden : ''} ${isProfileLegend ? styles.legendAvatar : ''}`}>
                  <UserIcon className={styles.placeholderIcon} />
                </div>
              )}
            </div>
            
            <div className={styles.profileInfo}>
              <div className={styles.profileNameContainer}>
                <h1 className={styles.profileName}>
                  {displayName}
                </h1>
                {isProfileLegend && (
                  <span className={styles.legendBadge}>Legend</span>
                )}
                {!isProfileLegend && isProfilePro && (
                  <span className={styles.proBadge}>PRO</span>
                )}
              </div>
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
              {/* Subscribe button for PRO and Legend users */}
              {isAuthenticated && (isProfilePro || isProfileLegend) && (
                <div className={styles.subscribeSection}>
                  <button 
                    className={styles.subscribeButton}
                    onClick={handleSubscribe}
                    disabled={isSubscribing}
                  >
                    {isSubscribed ? 'Subscribed ✓' : 'Subscribe'}
                  </button>
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
                onClick={() => handleTabChange('posts')}
              >
                <DocumentTextIcon className={styles.tabIcon} />
                Posts ({posts.length})
              </button>
              <button
                className={`${styles.tabButton} ${activeTab === 'highlights' ? styles.activeTab : ''}`}
                onClick={() => handleTabChange('highlights')}
              >
                <PencilIcon className={styles.tabIcon} />
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
          {contextMenu.postId && (
            <button 
              className={styles.contextMenuItem}
              onClick={async () => {
                await handleCopyNoteId(contextMenu.postId!);
                closeContextMenu();
              }}
            >
              Copy Note ID
            </button>
          )}
          {contextMenu.highlightId && (
            <>
              <button 
                className={styles.contextMenuItem}
                onClick={async () => {
                  await handleCopyNoteId(contextMenu.highlightId!);
                  closeContextMenu();
                }}
              >
                Copy Note ID
              </button>
              <button 
                className={styles.contextMenuItem}
                onClick={() => {
                  handleDeleteHighlight(contextMenu.highlightId!);
                  closeContextMenu();
                }}
              >
                Delete Highlight
              </button>
            </>
          )}
          <button 
            className={styles.contextMenuItem}
            onClick={async () => {
              if (contextMenu.highlightId) {
                const highlight = highlights.find(h => h.id === contextMenu.highlightId);
                if (highlight) {
                  await openHighlightJson(highlight);
                }
              } else if (contextMenu.postId) {
                const post = posts.find(p => p.id === contextMenu.postId);
                if (post) {
                  await openPostJson(post);
                }
              }
            }}
          >
            View JSON
          </button>
        </div>
      )}

      {/* JSON Modal */}
      <JsonModal
        isOpen={jsonModal.visible}
        onClose={() => setJsonModal({ visible: false, data: null })}
        data={jsonModal.data}
      />
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={handleConfirmModalClose}
        onConfirm={handleConfirmModalConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
      />
    </div>
  );
} 