import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: supabaseUrl,
    key: supabaseAnonKey ? 'present' : 'missing'
  });
  throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Create Supabase client
// Supabase automatically handles the API key - don't set it manually in headers
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Debug log (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('Supabase Config Debug:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'undefined',
    key: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'undefined'
  });
}

// Database types for TypeScript
export interface Pro {
  npub: string;
  last_payment: string;
  created_at?: string;
}

export interface ProStatus {
  isPro: boolean;
  lastPayment?: string;
  expiresAt?: string;
  isInBuffer?: boolean;
}

export interface Legend {
  npub: string;
  created_at: string;
}

export interface CustomEmoji {
  npub: string;
  name: string;
  url: string;
  created_at?: string;
}

export interface EmojiSet {
  id: string;
  pubkey: string;
  title: string;
  dTag: string;
  creator: string;
  created_at: number;
  emojis: EmojiFromSet[];
}

export interface EmojiFromSet {
  name: string;
  url: string;
}

export interface ActionQueue {
  id?: number; // int8 (bigint) with auto-increment in Supabase
  author: string;
  reader: string;
  action: 'subscribe' | 'unsubscribe';
  created_at?: string;
  processed?: boolean;
}
