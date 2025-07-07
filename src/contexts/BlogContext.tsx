'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';

interface AuthorProfile {
  name?: string;
  displayName?: string;
}

export interface BlogPost {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  title: string;
  summary: string;
  published_at: number;
  image?: string;
  tags: string[];
  author?: AuthorProfile;
  dTag?: string; // Add d tag for replaceable events
}

export type BlogContextType = {
  posts: BlogPost[];
  authorProfiles: Record<string, AuthorProfile>;
  readPosts: Set<string>;
  addPost: (post: BlogPost) => void;
  updateAuthorProfile: (pubkey: string, profile: AuthorProfile) => void;
  getPost: (id: string) => BlogPost | undefined;
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
  const [posts, setPosts] = useState<BlogPost[]>(() => {
    if (typeof window !== 'undefined') {
      const cachedPosts = localStorage.getItem('longform_posts');
      return cachedPosts ? JSON.parse(cachedPosts) : [];
    }
    return [];
  });

  const [readPosts, setReadPosts] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const cachedReadPosts = localStorage.getItem('longform_readPosts');
      return new Set(cachedReadPosts ? JSON.parse(cachedReadPosts) : []);
    }
    return new Set();
  });

  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>(() => {
    if (typeof window !== 'undefined') {
      const cachedProfiles = localStorage.getItem('longform_authorProfiles');
      return cachedProfiles ? JSON.parse(cachedProfiles) : {};
    }
    return {};
  });

  // Track which profiles are currently being fetched to prevent duplicates
  const fetchingProfiles = useRef<Set<string>>(new Set());
  const profileFetchPromises = useRef<Map<string, Promise<AuthorProfile | null>>>(new Map());

  const clearPostsRef = useRef(() => {
    setPosts([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('longform_posts');
    }
  });

  // Save to localStorage when posts change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('longform_posts', JSON.stringify(posts));
    }
  }, [posts]);

  // Save to localStorage when readPosts change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('longform_readPosts', JSON.stringify([...readPosts]));
    }
  }, [readPosts]);

  // Save to localStorage when authorProfiles change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('longform_authorProfiles', JSON.stringify(authorProfiles));
    }
  }, [authorProfiles]);

  const addPost = (post: BlogPost) => {
    setPosts(prev => {
      // Find existing post with the same id
      const existingPostIndex = prev.findIndex(p => p.id === post.id);
      
      if (existingPostIndex !== -1) {
        // If we found a post with the same id, only update if the new post is more recent
        if (post.created_at > prev[existingPostIndex].created_at) {
          const newPosts = [...prev];
          newPosts[existingPostIndex] = post;
          return newPosts;
        }
        return prev;
      }
      
      // If no post with the same id exists, add the new post
      return [post, ...prev];
    });
  };

  const getPost = (id: string) => {
    return posts.find(post => post.id === id);
  };

  const getSortedPosts = () => {
    return [...posts].sort((a, b) => b.created_at - a.created_at);
  };

  const updateAuthorProfile = (pubkey: string, profile: AuthorProfile) => {
    // Update the centralized author profiles cache
    setAuthorProfiles(prev => ({
      ...prev,
      [pubkey]: profile
    }));

    // Also update any posts that have this author
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
    // If already cached, return immediately
    if (pubkey in authorProfiles) {
      return authorProfiles[pubkey];
    }

    // If already being fetched, wait for the existing promise
    if (profileFetchPromises.current.has(pubkey)) {
      return await profileFetchPromises.current.get(pubkey)!;
    }

    // If not being fetched, start a new fetch
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
      const newReadPosts = new Set(prev).add(id);
      return newReadPosts;
    });
  };

  const isPostRead = (id: string) => {
    return readPosts.has(id);
  };

  const markPostAsUnread = (id: string) => {
    setReadPosts(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  return (
    <BlogContext.Provider value={{
      posts,
      authorProfiles,
      readPosts,
      addPost,
      updateAuthorProfile,
      getPost,
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