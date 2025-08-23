import { useSupabase } from '@/contexts/SupabaseContext';
import { useNostr } from '@/contexts/NostrContext';

/**
 * Custom hook for checking PRO status
 * Returns the current user's PRO status and utility functions
 */
export function useProStatus() {
  const { proStatus, isLoading, checkProStatus, refreshProStatus } = useSupabase();
  const { currentUser } = useNostr();

  const isPro = proStatus?.isPro || false;
  const expiresAt = proStatus?.expiresAt;
  const lastPayment = proStatus?.lastPayment;

  return {
    // Status
    isPro,
    isLoading,
    expiresAt,
    lastPayment,
    
    // Functions
    checkProStatus,
    refreshProStatus,
    
    // Current user info
    currentUserNpub: currentUser?.npub
  };
}
