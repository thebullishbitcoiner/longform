import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Supabase Config Debug:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'undefined',
  key: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'undefined'
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: supabaseUrl,
    key: supabaseAnonKey ? 'present' : 'missing'
  });
  throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export interface ActionQueue {
  id?: number; // int8 (bigint) with auto-increment in Supabase
  author: string;
  reader: string;
  action: 'subscribe' | 'unsubscribe';
  created_at?: string;
  processed?: boolean;
}
