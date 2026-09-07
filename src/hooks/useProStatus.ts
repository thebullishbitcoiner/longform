import { usePlatformStatus } from '@/contexts/PlatformStatusContext';
import { useNostr } from '@/contexts/NostrContext';

/**
 * PRO/Legend status for the logged-in user.
 * Fetches once in PlatformStatusProvider; do not add per-hook polling here.
 */
export function useProStatus() {
  const {
    proStatus,
    isLegend,
    isLoading,
    checkProStatus,
    refreshProStatus,
    checkLegendStatus,
  } = usePlatformStatus();
  const { currentUser } = useNostr();

  const isPro = proStatus?.isPro || false;
  const expiresAt = proStatus?.expiresAt;
  const isInBuffer = proStatus?.isInBuffer || false;
  const isProOrLegend = isPro || isLegend;

  return {
    isPro: isProOrLegend,
    isLegend,
    isLoading,
    expiresAt,
    isInBuffer,
    checkProStatus,
    refreshProStatus,
    checkLegendStatus,
    currentUserNpub: currentUser?.npub,
  };
}
