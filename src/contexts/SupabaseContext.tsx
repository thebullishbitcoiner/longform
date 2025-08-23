'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, ProStatus, Subscriber } from '@/config/supabase';
import { useNostr } from './NostrContext';

interface SupabaseContextType {
  proStatus: ProStatus | null;
  isLoading: boolean;
  checkProStatus: (npub: string) => Promise<ProStatus>;
  refreshProStatus: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextType>({
  proStatus: null,
  isLoading: false,
  checkProStatus: async () => ({ isPro: false }),
  refreshProStatus: async () => {}
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
    try {
      setIsLoading(true);
      
      console.log('Checking PRO status for npub:', npub);
      
      // Query the subscribers table for the given npub
      const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .eq('npub', npub)
        .single();

      console.log('Supabase query result:', { data, error });

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - user is not a subscriber
          console.log('No subscriber found for npub:', npub);
          return { isPro: false };
        }
        console.error('Supabase error:', error);
        throw error;
      }

      if (!data) {
        return { isPro: false };
      }

      const subscriber: Subscriber = data;
      const lastPayment = new Date(subscriber.last_payment);
      const now = new Date();
      
      // Check if the last payment was within the last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const isPro = lastPayment > thirtyDaysAgo;
      
      // Calculate expiration date (30 days from last payment)
      const expiresAt = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));

      const status: ProStatus = {
        isPro,
        lastPayment: subscriber.last_payment,
        expiresAt: expiresAt.toISOString()
      };

      return status;
    } catch (error) {
      console.error('Error checking PRO status:', error);
      return { isPro: false };
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProStatus = async () => {
    if (!currentUser?.npub) return;
    
    try {
      console.log('Refreshing PRO status for npub:', currentUser.npub);
      
      // Query the subscribers table for the given npub
      const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .eq('npub', currentUser.npub)
        .single();

      console.log('Supabase refresh query result:', { data, error });

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - user is not a subscriber
          console.log('No subscriber found for npub:', currentUser.npub);
          setProStatus({ isPro: false });
          return;
        }
        console.error('Supabase error:', error);
        return;
      }

      if (!data) {
        setProStatus({ isPro: false });
        return;
      }

      const subscriber: Subscriber = data;
      const lastPayment = new Date(subscriber.last_payment);
      const now = new Date();
      
      // Check if the last payment was within the last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const isPro = lastPayment > thirtyDaysAgo;
      
      // Calculate expiration date (30 days from last payment)
      const expiresAt = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));

      const status: ProStatus = {
        isPro,
        lastPayment: subscriber.last_payment,
        expiresAt: expiresAt.toISOString()
      };

      setProStatus(status);
    } catch (error) {
      console.error('Error refreshing PRO status:', error);
    }
  };

  // Check PRO status when user changes
  useEffect(() => {
    if (currentUser?.npub) {
      setIsLoading(true);
      refreshProStatus().finally(() => {
        setIsLoading(false);
      });
    } else {
      setProStatus(null);
      setIsLoading(false);
    }
  }, [currentUser?.npub]);

  return (
    <SupabaseContext.Provider value={{
      proStatus,
      isLoading,
      checkProStatus,
      refreshProStatus
    }}>
      {children}
    </SupabaseContext.Provider>
  );
}
