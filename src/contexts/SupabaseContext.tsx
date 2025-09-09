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
    try {
      setIsLoading(true);
      
      console.log('Checking PRO status for npub:', npub);
      
      // Query the pros table for the given npub
      const { data, error } = await supabase
        .from('pros')
        .select('npub, last_payment, created_at')
        .eq('npub', npub)
        .single();

      console.log('Supabase query result:', { data, error });

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - user is not a pro
          console.log('No pro found for npub:', npub);
          return { isPro: false };
        }
        console.error('Supabase error:', error);
        throw error;
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
    try {
      console.log('Checking Legend status for npub:', npub);
      
      // Query the legends table for the given npub
      const { data, error } = await supabase
        .from('legends')
        .select('npub, created_at')
        .eq('npub', npub)
        .single();

      console.log('Legends query result:', { data, error });

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - user is not a legend
          console.log('No legend found for npub:', npub);
          return false;
        }
        console.error('Supabase error:', error);
        throw error;
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
    
    try {
      console.log('Refreshing PRO status for npub:', currentUser.npub);
      
      // Query the pros table for the given npub
      const { data, error } = await supabase
        .from('pros')
        .select('npub, last_payment, created_at')
        .eq('npub', currentUser.npub)
        .single();

      console.log('Supabase refresh query result:', { data, error });

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - user is not a pro
          console.log('No pro found for npub:', currentUser.npub);
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
      checkLegendStatus,
      refreshProStatus,
      addLegend
    }}>
      {children}
    </SupabaseContext.Provider>
  );
}
