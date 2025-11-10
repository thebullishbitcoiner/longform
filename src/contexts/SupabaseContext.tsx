'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, ProStatus, Pro } from '@/config/supabase';
import { useNostr } from './NostrContext';

interface SupabaseContextType {
  proStatus: ProStatus | null;
  isLoading: boolean;
  checkProStatus: (npub: string) => Promise<ProStatus>;
  checkLegendStatus: (npub: string) => Promise<boolean>;
  refreshProStatus: () => Promise<void>;
  addLegend: (npub: string) => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextType>({
  proStatus: null,
  isLoading: false,
  checkProStatus: async () => ({ isPro: false }),
  checkLegendStatus: async () => false,
  refreshProStatus: async () => {},
  addLegend: async () => {}
});

export const useSupabase = () => useContext(SupabaseContext);

interface SupabaseProviderProps {
  children: ReactNode;
}

export function SupabaseProvider({ children }: SupabaseProviderProps) {
  const [proStatus, setProStatus] = useState<ProStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { currentUser } = useNostr();

  const checkProStatus = async (npub: string): Promise<ProStatus> => {
    // Verify Supabase client is ready
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn('Supabase not configured, returning false for PRO status');
      return { isPro: false };
    }
    
    try {
      setIsLoading(true);
      
      console.log('Checking PRO status for npub:', npub);
      
      // Query the pros table for the given npub
      const { data, error } = await supabase
        .from('pros')
        .select('npub, last_payment, created_at')
        .eq('npub', npub)
        .single();

      if (error) {
        // PGRST116 = no rows returned (user is not a pro) - this is expected
        if (error.code === 'PGRST116') {
          console.log('No pro found for npub:', npub);
          return { isPro: false };
        }
        // 406 errors - handle gracefully (might be from retries or preflight requests)
        // Check if it's a 406 status code or API key related
        if (error.status === 406 || error.message?.includes('API key') || error.message?.includes('apikey') || error.message?.includes('No API key')) {
          // Silently handle - this is often from retries or preflight requests
          return { isPro: false };
        }
        // Only log unexpected errors
        if (error.code !== 'PGRST116' && error.status !== 406) {
          console.error('Supabase error checking PRO status:', error);
        }
        return { isPro: false };
      }

      if (!data) {
        return { isPro: false };
      }

      const pro: Pro = data;
      const lastPayment = new Date(pro.last_payment);
      const now = new Date();
      
      // Calculate expiration date (30 days from last payment)
      const expiresAt = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));
      
      // Check if the user is in the buffer period (14 days after expiration)
      const bufferEndDate = new Date(expiresAt.getTime() + (14 * 24 * 60 * 60 * 1000));
      const isInBuffer = now > expiresAt && now <= bufferEndDate;
      
      // User is PRO if they're within the 30-day period OR in the buffer period
      const isPro = now <= bufferEndDate;

      const status: ProStatus = {
        isPro,
        lastPayment: pro.last_payment,
        expiresAt: expiresAt.toISOString(),
        isInBuffer
      };

      return status;
    } catch (error) {
      console.error('Error checking PRO status:', error);
      return { isPro: false };
    } finally {
      setIsLoading(false);
    }
  };

  const checkLegendStatus = async (npub: string): Promise<boolean> => {
    // Verify Supabase client is ready
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn('Supabase not configured, returning false for Legend status');
      return false;
    }
    
    try {
      console.log('Checking Legend status for npub:', npub);
      
      // Query the legends table for the given npub
      const { data, error } = await supabase
        .from('legends')
        .select('npub, created_at')
        .eq('npub', npub)
        .single();

      if (error) {
        // PGRST116 = no rows returned (user is not a legend) - this is expected
        if (error.code === 'PGRST116') {
          console.log('No legend found for npub:', npub);
          return false;
        }
        // 406 errors - handle gracefully (might be from retries or preflight requests)
        // Check if it's a 406 status code or API key related
        if (error.status === 406 || error.message?.includes('API key') || error.message?.includes('apikey') || error.message?.includes('No API key')) {
          // Silently handle - this is often from retries or preflight requests
          return false;
        }
        // Only log unexpected errors
        if (error.code !== 'PGRST116' && error.status !== 406) {
          console.error('Supabase error checking Legend status:', error);
        }
        return false;
      }

      if (!data) {
        return false;
      }

      // User is a legend if they exist in the legends table
      return true;
    } catch (error) {
      console.error('Error checking Legend status:', error);
      return false;
    }
  };

  const refreshProStatus = async () => {
    if (!currentUser?.npub) return;
    
    // Verify Supabase client is ready (check if env vars are available)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn('Supabase not configured, skipping PRO status check');
      return;
    }
    
    try {
      console.log('Refreshing PRO status for npub:', currentUser.npub);
      
      // Query the pros table for the given npub
      const { data, error } = await supabase
        .from('pros')
        .select('npub, last_payment, created_at')
        .eq('npub', currentUser.npub)
        .single();

      if (error) {
        // PGRST116 = no rows returned (user is not a pro) - this is expected
        if (error.code === 'PGRST116') {
          console.log('No pro found for npub:', currentUser.npub);
          setProStatus({ isPro: false });
          return;
        }
        // 406 errors - handle gracefully (might be from retries or preflight requests)
        // Check if it's a 406 status code or API key related
        if (error.status === 406 || error.message?.includes('API key') || error.message?.includes('apikey') || error.message?.includes('No API key')) {
          // Silently handle - this is often from retries or preflight requests
          setProStatus({ isPro: false });
          return;
        }
        // Only log unexpected errors
        if (error.code !== 'PGRST116' && error.status !== 406) {
          console.error('Supabase error refreshing PRO status:', error);
        }
        setProStatus({ isPro: false });
        return;
      }

      if (!data) {
        setProStatus({ isPro: false });
        return;
      }

      const pro: Pro = data;
      const lastPayment = new Date(pro.last_payment);
      const now = new Date();
      
      // Calculate expiration date (30 days from last payment)
      const expiresAt = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));
      
      // Check if the user is in the buffer period (14 days after expiration)
      const bufferEndDate = new Date(expiresAt.getTime() + (14 * 24 * 60 * 60 * 1000));
      const isInBuffer = now > expiresAt && now <= bufferEndDate;
      
      // User is PRO if they're within the 30-day period OR in the buffer period
      const isPro = now <= bufferEndDate;

      const status: ProStatus = {
        isPro,
        lastPayment: pro.last_payment,
        expiresAt: expiresAt.toISOString(),
        isInBuffer
      };

      setProStatus(status);
    } catch (error) {
      console.error('Error refreshing PRO status:', error);
    }
  };

  const addLegend = async (npub: string): Promise<void> => {
    try {
      console.log('Adding legend for npub:', npub);
      
      const { error } = await supabase
        .from('legends')
        .insert({
          npub: npub,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Supabase error adding legend:', error);
        throw error;
      }

      console.log('Successfully added legend for npub:', npub);
    } catch (error) {
      console.error('Error adding legend:', error);
      throw error;
    }
  };

  // Clear PRO status when user logs out
  // Note: We don't auto-refresh on user change anymore - components that need it can call refreshProStatus explicitly
  useEffect(() => {
    if (!currentUser?.npub) {
      setProStatus(null);
      setIsLoading(false);
    }
  }, [currentUser?.npub]);

  return (
    <SupabaseContext.Provider value={{
      proStatus,
      isLoading,
      checkProStatus,
      checkLegendStatus,
      refreshProStatus,
      addLegend
    }}>
      {children}
    </SupabaseContext.Provider>
  );
}
