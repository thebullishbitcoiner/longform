'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useNostr } from './NostrContext';
import { npubToHex } from '@/utils/nostr';
import { fetchPlatformMe, platformMeToProStatus } from '@/utils/platformMeStatus';
import type { MeStatusResponse } from '@/types/platformStatus';
import type { ProStatus } from '@/types/platformBilling';

interface PlatformStatusContextType {
  proStatus: ProStatus | null;
  meStatus: MeStatusResponse | null;
  isLegend: boolean;
  isLoading: boolean;
  checkProStatus: (npub: string) => Promise<ProStatus>;
  checkLegendStatus: (npub: string) => Promise<boolean>;
  refreshProStatus: () => Promise<void>;
}

const PlatformStatusContext = createContext<PlatformStatusContextType>({
  proStatus: null,
  meStatus: null,
  isLegend: false,
  isLoading: false,
  checkProStatus: async () => ({ isPro: false }),
  checkLegendStatus: async () => false,
  refreshProStatus: async () => {},
});

export const usePlatformStatus = () => useContext(PlatformStatusContext);

/** @deprecated Use `usePlatformStatus` */
export const useSupabase = usePlatformStatus;

interface PlatformStatusProviderProps {
  children: ReactNode;
}

export function PlatformStatusProvider({ children }: PlatformStatusProviderProps) {
  const [proStatus, setProStatus] = useState<ProStatus | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatusResponse | null>(null);
  const [isLegend, setIsLegend] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { currentUser } = useNostr();

  const refreshProStatus = useCallback(async () => {
    if (!currentUser?.pubkey) return;

    const platform = await fetchPlatformMe(currentUser.pubkey);
    if (platform.kind === 'ok') {
      setMeStatus(platform.data);
      setProStatus(platformMeToProStatus(platform.data));
      setIsLegend(platform.data.isLegend);
      return;
    }

    setMeStatus(null);
    setIsLegend(false);
    setProStatus(platform.kind === 'error' ? { isPro: false } : null);
  }, [currentUser?.pubkey]);

  const checkProStatus = useCallback(async (npub: string): Promise<ProStatus> => {
    const hex = npubToHex(npub);
    if (!hex) return { isPro: false };

    const platform = await fetchPlatformMe(hex);
    if (platform.kind === 'ok') return platformMeToProStatus(platform.data);
    return { isPro: false };
  }, []);

  const checkLegendStatus = useCallback(async (npub: string): Promise<boolean> => {
    const hex = npubToHex(npub);
    if (!hex) return false;

    const platform = await fetchPlatformMe(hex);
    if (platform.kind === 'ok') return platform.data.isLegend;
    return false;
  }, []);

  useEffect(() => {
    if (!currentUser?.pubkey) {
      setProStatus(null);
      setMeStatus(null);
      setIsLegend(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void refreshProStatus().finally(() => setIsLoading(false));
  }, [currentUser?.pubkey, refreshProStatus]);

  return (
    <PlatformStatusContext.Provider
      value={{
        proStatus,
        meStatus,
        isLegend,
        isLoading,
        checkProStatus,
        checkLegendStatus,
        refreshProStatus,
      }}
    >
      {children}
    </PlatformStatusContext.Provider>
  );
}

/** @deprecated Use `PlatformStatusProvider` */
export const SupabaseProvider = PlatformStatusProvider;
