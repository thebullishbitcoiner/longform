'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import toast from 'react-hot-toast';
import { safeSetItem, STORAGE_KEYS } from '@/utils/storage';
import { useNostr } from '@/contexts/NostrContext';
import { Nip07Signer } from '@/utils/nip07Signer';
import {
  fetchLatestReadStateEvent,
  decryptReadStateFromEvent,
  publishReadState,
  READ_STATE_D_TAG,
} from '@/nostr/readState';
import { KIND_APP_SPECIFIC_DATA } from '@/nostr/kinds';
import type { AuthorProfile, BlogPost } from '@/types/content';

export type { AuthorProfile, BlogPost };

const READ_SYNC_DEBOUNCE_MS = 2000;
/** Legacy key — removed at runtime so old local read lists are not reused */
const LEGACY_READ_POSTS_KEY = 'longform_readPosts';

export type BlogContextType = {
  posts: BlogPost[];
  authorProfiles: Record<string, AuthorProfile>;
  readPosts: Set<string>;
  addPost: (post: BlogPost) => void;
  updateAuthorProfile: (pubkey: string, profile: AuthorProfile) => void;
  getPost: (id: string) => BlogPost | undefined;
  getPostByAuthorAndD: (pubkey: string, dTag: string) => BlogPost | undefined;
  getSortedPosts: () => BlogPost[];
  isPostRead: (id: string) => boolean;
  markPostAsRead: (id: string) => void;
  markPostAsUnread: (id: string) => void;
  clearPosts: () => void;
  getAuthorProfile: (pubkey: string) => AuthorProfile | undefined;
  isProfileFetched: (pubkey: string) => boolean;
  fetchProfileOnce: (pubkey: string, fetchFn: () => Promise<AuthorProfile | null>) => Promise<AuthorProfile | null>;
};

const BlogContext = createContext<BlogContextType>({
  posts: [],
  authorProfiles: {},
  readPosts: new Set(),
  addPost: () => {},
  updateAuthorProfile: () => {},
  getPost: () => undefined,
  getPostByAuthorAndD: () => undefined,
  getSortedPosts: () => [],
  isPostRead: () => false,
  markPostAsRead: () => {},
  markPostAsUnread: () => {},
  clearPosts: () => {},
  getAuthorProfile: () => undefined,
  isProfileFetched: () => false,
  fetchProfileOnce: async () => null,
});

export const useBlog = () => useContext(BlogContext);

interface BlogProviderProps {
  children: ReactNode;
}

export function BlogProvider({ children }: BlogProviderProps) {
  const { ndk, isAuthenticated, isConnected, currentUser } = useNostr();

  const [posts, setPosts] = useState<BlogPost[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cachedPosts = localStorage.getItem(STORAGE_KEYS.POSTS);
        return cachedPosts ? JSON.parse(cachedPosts) : [];
      } catch (error) {
        console.error('Error loading posts from storage:', error);
        return [];
      }
    }
    return [];
  });

  const [readPosts, setReadPosts] = useState<Set<string>>(() => new Set());

  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cachedProfiles = localStorage.getItem(STORAGE_KEYS.AUTHOR_PROFILES);
        return cachedProfiles ? JSON.parse(cachedProfiles) : {};
      } catch (error) {
        console.error('Error loading author profiles from storage:', error);
        return {};
      }
    }
    return {};
  });

  const readPostsRef = useRef<Set<string>>(new Set());
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nip44WarnedRef = useRef(false);

  const fetchingProfiles = useRef<Set<string>>(new Set());
  const profileFetchPromises = useRef<Map<string, Promise<AuthorProfile | null>>>(new Map());

  const clearPostsRef = useRef(() => {
    setPosts([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.POSTS);
    }
  });

  useEffect(() => {
    readPostsRef.current = readPosts;
  }, [readPosts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(LEGACY_READ_POSTS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const clearPublishTimer = useCallback(() => {
    if (publishTimerRef.current) {
      clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof window === 'undefined' || window.nostr?.nip44) return;
    if (nip44WarnedRef.current) return;
    nip44WarnedRef.current = true;
    toast.error(
      'Your Nostr extension does not support NIP-44. Read/unread state will not sync across devices.'
    );
  }, [isAuthenticated]);

  const schedulePublishReadState = useCallback(() => {
    if (typeof window === 'undefined' || !window.nostr?.nip44) return;
    if (!isAuthenticated || !currentUser?.pubkey) return;
    const signer = ndk.signer;
    if (!(signer instanceof Nip07Signer)) return;

    clearPublishTimer();
    publishTimerRef.current = setTimeout(async () => {
      publishTimerRef.current = null;
      const snapshot = readPostsRef.current;
      try {
        await publishReadState(ndk, signer, snapshot);
      } catch (e) {
        console.error('[readState] publish failed', e);
        toast.error('Could not sync read state to relays.');
      }
    }, READ_SYNC_DEBOUNCE_MS);
  }, [ndk, isAuthenticated, currentUser?.pubkey, clearPublishTimer]);

  useEffect(() => {
    if (!isAuthenticated || !isConnected || !currentUser?.pubkey) return;
    if (typeof window !== 'undefined' && !window.nostr?.nip44) return;

    const signer = ndk.signer;
    if (!(signer instanceof Nip07Signer)) return;

    let cancelled = false;

    void (async () => {
      try {
        const ev = await fetchLatestReadStateEvent(ndk, currentUser.pubkey);
        if (cancelled || !ev) return;
        const ids = await decryptReadStateFromEvent(signer, ev, currentUser.pubkey);
        if (cancelled) return;
        setReadPosts((prev) => new Set([...prev, ...ids]));
      } catch (e) {
        console.warn('[readState] initial fetch failed', e);
      }
    })();

    const sub = ndk.subscribe(
      {
        kinds: [KIND_APP_SPECIFIC_DATA],
        authors: [currentUser.pubkey],
        '#d': [READ_STATE_D_TAG],
      },
      { closeOnEose: false }
    );

    const onIncoming = async (event: NDKEvent) => {
      if (cancelled) return;
      try {
        const ids = await decryptReadStateFromEvent(signer, event, currentUser.pubkey);
        if (ids.size === 0) return;
        setReadPosts((prev) => {
          let added = false;
          const next = new Set(prev);
          for (const id of ids) {
            if (!next.has(id)) {
              next.add(id);
              added = true;
            }
          }
          return added ? next : prev;
        });
      } catch {
        /* ignore */
      }
    };

    sub.on('event', (ev: NDKEvent) => {
      void onIncoming(ev);
    });

    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [ndk, isAuthenticated, isConnected, currentUser?.pubkey]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearPublishTimer();
      setReadPosts(new Set());
      readPostsRef.current = new Set();
    }
  }, [isAuthenticated, clearPublishTimer]);

  useEffect(() => {
    return () => {
      clearPublishTimer();
    };
  }, [clearPublishTimer]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const success = safeSetItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
      if (!success) {
        console.warn('Failed to save posts due to storage constraints');
      }
    }
  }, [posts]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const success = safeSetItem(STORAGE_KEYS.AUTHOR_PROFILES, JSON.stringify(authorProfiles));
      if (!success) {
        console.warn('Failed to save author profiles due to storage constraints');
      }
    }
  }, [authorProfiles]);

  const addPost = (post: BlogPost) => {
    setPosts(prev => {
      const existingPostIndex = prev.findIndex(p => p.id === post.id);

      if (existingPostIndex !== -1) {
        if (post.created_at > prev[existingPostIndex].created_at) {
          const newPosts = [...prev];
          newPosts[existingPostIndex] = post;
          return newPosts;
        }
        return prev;
      }

      return [post, ...prev];
    });
  };

  const getPost = (id: string) => {
    return posts.find(post => post.id === id);
  };

  const getPostByAuthorAndD = (pubkey: string, dTag: string) => {
    return posts.find(
      p => p.pubkey === pubkey && (p.dTag === dTag || p.id.slice(0, 8) === dTag)
    );
  };

  const getSortedPosts = () => {
    return [...posts].sort((a, b) => b.created_at - a.created_at);
  };

  const updateAuthorProfile = (pubkey: string, profile: AuthorProfile) => {
    setAuthorProfiles(prev => ({
      ...prev,
      [pubkey]: profile
    }));

    setPosts(prev => prev.map(post => {
      if (post.pubkey === pubkey) {
        return { ...post, author: profile };
      }
      return post;
    }));
  };

  const getAuthorProfile = (pubkey: string) => {
    return authorProfiles[pubkey];
  };

  const isProfileFetched = (pubkey: string) => {
    return pubkey in authorProfiles || fetchingProfiles.current.has(pubkey);
  };

  const fetchProfileOnce = async (pubkey: string, fetchFn: () => Promise<AuthorProfile | null>) => {
    if (pubkey in authorProfiles) {
      return authorProfiles[pubkey];
    }

    if (profileFetchPromises.current.has(pubkey)) {
      return await profileFetchPromises.current.get(pubkey)!;
    }

    fetchingProfiles.current.add(pubkey);
    const fetchPromise = fetchFn().then(profile => {
      if (profile) {
        updateAuthorProfile(pubkey, profile);
      }
      fetchingProfiles.current.delete(pubkey);
      profileFetchPromises.current.delete(pubkey);
      return profile;
    }).catch(error => {
      console.error('Error fetching profile for:', pubkey, error);
      fetchingProfiles.current.delete(pubkey);
      profileFetchPromises.current.delete(pubkey);
      return null;
    });

    profileFetchPromises.current.set(pubkey, fetchPromise);
    return await fetchPromise;
  };

  const markPostAsRead = (id: string) => {
    setReadPosts(prev => {
      const next = new Set(prev).add(id);
      readPostsRef.current = next;
      return next;
    });
    schedulePublishReadState();
  };

  const isPostRead = (id: string) => {
    return readPosts.has(id);
  };

  const markPostAsUnread = (id: string) => {
    setReadPosts(prev => {
      const next = new Set(prev);
      next.delete(id);
      readPostsRef.current = next;
      return next;
    });
    schedulePublishReadState();
  };

  return (
    <BlogContext.Provider value={{
      posts,
      authorProfiles,
      readPosts,
      addPost,
      updateAuthorProfile,
      getPost,
      getPostByAuthorAndD,
      getSortedPosts,
      isPostRead,
      markPostAsRead,
      markPostAsUnread,
      clearPosts: clearPostsRef.current,
      getAuthorProfile,
      isProfileFetched,
      fetchProfileOnce,
    }}>
      {children}
    </BlogContext.Provider>
  );
}
