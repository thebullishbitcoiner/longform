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
});

export const useBlog = () => useContext(BlogContext);

interface BlogProviderProps {
  children: ReactNode;
}

export function BlogProvider({ children }: BlogProviderProps) {
  const [posts, setPosts] = useState<BlogPost[]>(() => {
    if (typeof window !== 'undefined') {
      const cachedPosts = localStorage.getItem('long_posts');
      return cachedPosts ? JSON.parse(cachedPosts) : [];
    }
    return [];
  });

  const [readPosts, setReadPosts] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const cachedReadPosts = localStorage.getItem('long_read_posts');
      return new Set(cachedReadPosts ? JSON.parse(cachedReadPosts) : []);
    }
    return new Set();
  });

  const clearPostsRef = useRef(() => {
    setPosts([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('long_posts');
    }
  });

  // Save to localStorage when posts change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('long_posts', JSON.stringify(posts));
    }
  }, [posts]);

  // Save to localStorage when readPosts change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('long_read_posts', JSON.stringify([...readPosts]));
    }
  }, [readPosts]);

  const addPost = (post: BlogPost) => {
    setPosts(prev => {
      // Don't add duplicate posts
      if (prev.some(p => p.id === post.id)) {
        return prev;
      }
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
    setPosts(prev => prev.map(post => {
      if (post.pubkey === pubkey) {
        return { ...post, author: profile };
      }
      return post;
    }));
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
      authorProfiles: {},
      readPosts,
      addPost,
      updateAuthorProfile,
      getPost,
      getSortedPosts,
      isPostRead,
      markPostAsRead,
      markPostAsUnread,
      clearPosts: clearPostsRef.current
    }}>
      {children}
    </BlogContext.Provider>
  );
} 