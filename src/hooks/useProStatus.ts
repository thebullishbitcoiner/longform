import { useSupabase } from '@/contexts/SupabaseContext';
import { useNostr } from '@/contexts/NostrContext';
import { useState, useEffect } from 'react';

/**
 * Custom hook for checking PRO and Legend status
 * Returns the current user's PRO/Legend status and utility functions
 */
export function useProStatus() {
  const { proStatus, isLoading, checkProStatus, refreshProStatus, checkLegendStatus } = useSupabase();
  const { currentUser } = useNostr();
  const [isLegend, setIsLegend] = useState(false);
  const [isCheckingLegend, setIsCheckingLegend] = useState(false);

  // Check legend status when user changes
  useEffect(() => {
    if (currentUser?.npub) {
      setIsCheckingLegend(true);
      checkLegendStatus(currentUser.npub)
        .then(setIsLegend)
        .catch(error => {
          console.error('Error checking legend status:', error);
          setIsLegend(false);
        })
        .finally(() => {
          setIsCheckingLegend(false);
        });
    } else {
      setIsLegend(false);
      setIsCheckingLegend(false);
    }
  }, [currentUser?.npub, checkLegendStatus]);

  const isPro = proStatus?.isPro || false;
  const expiresAt = proStatus?.expiresAt;
  const lastPayment = proStatus?.lastPayment;
  const isInBuffer = proStatus?.isInBuffer || false;

  // isPro should be true if user is either PRO or Legend
  const isProOrLegend = isPro || isLegend;

  return {
    // Status
    isPro: isProOrLegend,
    isLegend,
    isLoading: isLoading || isCheckingLegend,
    expiresAt,
    lastPayment,
    isInBuffer,
    
    // Functions
    checkProStatus,
    refreshProStatus,
    checkLegendStatus,
    
    // Current user info
    currentUserNpub: currentUser?.npub
  };
}
