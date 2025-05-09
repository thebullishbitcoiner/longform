'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

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

interface BlogContextType {
  posts: BlogPost[];
  getSortedPosts: () => BlogPost[];
  addPost: (post: BlogPost) => void;
  getPost: (id: string) => BlogPost | undefined;
  updateAuthorProfile: (pubkey: string, profile: AuthorProfile) => void;
}

const BlogContext = createContext<BlogContextType>({
  posts: [],
  getSortedPosts: () => [],
  addPost: () => {},
  getPost: () => undefined,
  updateAuthorProfile: () => {},
});

export const useBlog = () => useContext(BlogContext);

interface BlogProviderProps {
  children: ReactNode;
}

export function BlogProvider({ children }: BlogProviderProps) {
  const [posts, setPosts] = useState<BlogPost[]>([]);

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

  return (
    <BlogContext.Provider value={{ posts, getSortedPosts, addPost, getPost, updateAuthorProfile }}>
      {children}
    </BlogContext.Provider>
  );
} 