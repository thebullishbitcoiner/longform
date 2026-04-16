import { useCallback, useEffect, useRef, useState } from 'react';
import { decode } from 'bolt11';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import {
  KIND_NIP22_COMMENT,
  KIND_REACTION,
  KIND_TEXT_NOTE,
  KIND_ZAP,
  KINDS_REPOST,
  longformArticleCoordinate,
} from '@/nostr/kinds';
import { nostrDebug } from '@/nostr/debug';
import type { ReactionData, RepostData, TopZapBadge, ZapData } from './interactionTypes';

/** Bolt11 / NIP-57 description payload may embed a JSON zap request with a `content` comment. */
function zapRequestCommentFromDescriptionPayload(payload: string): string | undefined {
  const raw = payload.trim();
  if (!raw.startsWith('{')) return undefined;
  try {
    const obj = JSON.parse(raw) as { content?: unknown };
    if (typeof obj.content === 'string') {
      const t = obj.content.trim();
      return t || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseZapReceiptEvent(zap: NDKEvent): {
  zapperPubkey: string;
  amount: number;
  rawDescriptionLine: string;
  zapRequestComment?: string;
} | null {
  try {
    const bolt11Tag = zap.tags.find((tag) => tag[0] === 'bolt11');
    const descriptionTag = zap.tags.find((tag) => tag[0] === 'description');
    const zapperPubkeyTag = zap.tags.find((tag) => tag[0] === 'P');
    const zapperPubkey = zapperPubkeyTag?.[1] || zap.pubkey;

    let amount = 0;
    let descriptionFromBolt11 = '';
    if (bolt11Tag?.[1]) {
      try {
        const decoded = decode(bolt11Tag[1].trim());
        amount = decoded.satoshis || 0;
        descriptionFromBolt11 = decoded.tagsObject?.description || '';
      } catch {
        const amountTag = zap.tags.find((tag) => tag[0] === 'amount');
        if (amountTag?.[1]) amount = parseInt(amountTag[1], 10) / 1000;
      }
    } else {
      const amountTag = zap.tags.find((tag) => tag[0] === 'amount');
      if (amountTag?.[1]) amount = parseInt(amountTag[1], 10) / 1000;
    }

    const rawDescriptionLine = descriptionFromBolt11 || descriptionTag?.[1] || zap.content || '';
    const zapRequestComment = zapRequestCommentFromDescriptionPayload(rawDescriptionLine);

    return { zapperPubkey, amount, rawDescriptionLine, zapRequestComment };
  } catch {
    return null;
  }
}

interface ReactionStats {
  likes: number;
  comments: number;
  zaps: number;
  reposts: number;
  isLoading: boolean;
}

interface UseInteractionDataParams {
  ndk: NDK | null;
  postId?: string;
  postPubkey?: string;
  dParam?: string;
  getAuthorProfile: (pubkey: string) => { displayName?: string; name?: string; image?: string; picture?: string } | undefined;
  updateAuthorProfile: (
    pubkey: string,
    profile: { name?: string; displayName?: string; nip05?: string; image?: string; picture?: string }
  ) => void;
}

const initialStats: ReactionStats = {
  likes: 0,
  comments: 0,
  zaps: 0,
  reposts: 0,
  isLoading: false,
};

export function useInteractionData({
  ndk,
  postId,
  postPubkey,
  dParam,
  getAuthorProfile,
  updateAuthorProfile,
}: UseInteractionDataParams) {
  const [statsSection, setStatsSection] = useState<ReactionStats>(initialStats);

  const [showZapsModal, setShowZapsModal] = useState(false);
  const [zapData, setZapData] = useState<ZapData[]>([]);
  const [isLoadingZaps, setIsLoadingZaps] = useState(false);
  const [topZapBadges, setTopZapBadges] = useState<TopZapBadge[]>([]);

  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [reactionData, setReactionData] = useState<ReactionData[]>([]);
  const [isLoadingReactions, setIsLoadingReactions] = useState(false);

  const [showRepostsModal, setShowRepostsModal] = useState(false);
  const [repostData, setRepostData] = useState<RepostData[]>([]);
  const [isLoadingReposts, setIsLoadingReposts] = useState(false);

  const [openReactionMenuId, setOpenReactionMenuId] = useState<string | null>(null);
  const [openZapMenuId, setOpenZapMenuId] = useState<string | null>(null);

  const zapDataCacheRef = useRef<Map<string, ZapData[]>>(new Map());
  const reactionDataCacheRef = useRef<Map<string, ReactionData[]>>(new Map());
  const repostDataCacheRef = useRef<Map<string, RepostData[]>>(new Map());

  const zapFetchInFlightRef = useRef<Map<string, Promise<ZapData[]>>>(new Map());
  const reactionFetchInFlightRef = useRef<Map<string, Promise<ReactionData[]>>>(new Map());
  const repostFetchInFlightRef = useRef<Map<string, Promise<RepostData[]>>>(new Map());

  const getArticleCoordinate = useCallback(() => {
    const currentDTag = dParam ? decodeURIComponent(dParam) : undefined;
    return postPubkey && currentDTag ? longformArticleCoordinate(postPubkey, currentDTag) : undefined;
  }, [dParam, postPubkey]);

  const enrichProfile = useCallback(
    async (pubkey: string) => {
      const cachedProfile = getAuthorProfile(pubkey);
      if (cachedProfile) {
        return {
          authorName: cachedProfile.displayName || cachedProfile.name,
          authorPicture: cachedProfile.image || cachedProfile.picture,
        };
      }

      if (!ndk) return { authorName: undefined, authorPicture: undefined };
      const user = ndk.getUser({ pubkey });
      const profile = await user.fetchProfile();
      if (!profile) return { authorName: undefined, authorPicture: undefined };

      updateAuthorProfile(pubkey, {
        name: profile.name,
        displayName: profile.displayName,
        nip05: profile.nip05,
        image: profile.image,
        picture: profile.picture,
      });

      return {
        authorName: profile.displayName || profile.name,
        authorPicture: profile.image || profile.picture,
      };
    },
    [getAuthorProfile, ndk, updateAuthorProfile]
  );

  /** Loads full zap list into cache; safe to call multiple times / in parallel with in-flight dedupe. */
  const loadZapDetailsIntoCache = useCallback(
    async (targetPostId: string): Promise<ZapData[]> => {
      if (!ndk) return [];

      const cached = zapDataCacheRef.current.get(targetPostId);
      if (cached) return cached;

      const existing = zapFetchInFlightRef.current.get(targetPostId);
      if (existing) return existing;

      const promise = (async () => {
        try {
          const aCoordinate = getArticleCoordinate();
          const zapsByE = await ndk.fetchEvents({ kinds: [KIND_ZAP], '#e': [targetPostId] });
          const zapsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_ZAP], '#a': [aCoordinate] }) : new Set();

          const uniqueZaps = new Map<string, NDKEvent>();
          for (const ev of zapsByE) uniqueZaps.set(ev.id, ev);
          for (const ev of zapsByA as Set<NDKEvent>) uniqueZaps.set(ev.id, ev);

          const zapDetails: ZapData[] = [];
          for (const zap of uniqueZaps.values()) {
            try {
              const parsed = parseZapReceiptEvent(zap);
              if (!parsed) continue;

              let authorName: string | undefined;
              let authorPicture: string | undefined;
              try {
                const profile = await enrichProfile(parsed.zapperPubkey);
                authorName = profile.authorName;
                authorPicture = profile.authorPicture;
              } catch {
                // Ignore profile fetch failures for zaps.
              }

              zapDetails.push({
                id: zap.id,
                pubkey: parsed.zapperPubkey,
                amount: parsed.amount,
                content: parsed.rawDescriptionLine,
                created_at: zap.created_at,
                authorName,
                authorPicture,
                zapMessage: parsed.zapRequestComment,
                event: zap,
              });
            } catch {
              // Skip malformed zap event.
            }
          }

          zapDetails.sort((a, b) => b.amount - a.amount);
          zapDataCacheRef.current.set(targetPostId, zapDetails);
          return zapDetails;
        } finally {
          zapFetchInFlightRef.current.delete(targetPostId);
        }
      })();

      zapFetchInFlightRef.current.set(targetPostId, promise);
      return promise;
    },
    [enrichProfile, getArticleCoordinate, ndk]
  );

  /** Loads full reaction list into cache; in-flight dedupe per post. */
  const loadReactionDetailsIntoCache = useCallback(
    async (targetPostId: string): Promise<ReactionData[]> => {
      if (!ndk) return [];

      const cached = reactionDataCacheRef.current.get(targetPostId);
      if (cached) return cached;

      const existing = reactionFetchInFlightRef.current.get(targetPostId);
      if (existing) return existing;

      const promise = (async () => {
        try {
          const aCoordinate = getArticleCoordinate();
          const reactionsByE = await ndk.fetchEvents({ kinds: [KIND_REACTION], '#e': [targetPostId] });
          const reactionsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_REACTION], '#a': [aCoordinate] }) : new Set();

          const uniqueReactions = new Map<string, NDKEvent>();
          for (const ev of reactionsByE) uniqueReactions.set(ev.id, ev);
          for (const ev of reactionsByA as Set<NDKEvent>) uniqueReactions.set(ev.id, ev);

          const reactionDetails: ReactionData[] = [];
          for (const reaction of uniqueReactions.values()) {
            try {
              const content = reaction.content.trim();
              if (!content) continue;

              let authorName: string | undefined;
              let authorPicture: string | undefined;
              try {
                const profile = await enrichProfile(reaction.pubkey);
                authorName = profile.authorName;
                authorPicture = profile.authorPicture;
              } catch (error) {
                console.error('Error fetching reaction author profile:', error);
              }

              reactionDetails.push({
                id: reaction.id,
                pubkey: reaction.pubkey,
                content,
                created_at: reaction.created_at,
                authorName,
                authorPicture,
                event: reaction,
              });
            } catch (error) {
              console.error('Error parsing reaction event:', error);
            }
          }

          reactionDetails.sort((a, b) => b.created_at - a.created_at);
          reactionDataCacheRef.current.set(targetPostId, reactionDetails);
          return reactionDetails;
        } finally {
          reactionFetchInFlightRef.current.delete(targetPostId);
        }
      })();

      reactionFetchInFlightRef.current.set(targetPostId, promise);
      return promise;
    },
    [enrichProfile, getArticleCoordinate, ndk]
  );

  /** Loads full repost list into cache; in-flight dedupe per post. */
  const loadRepostDetailsIntoCache = useCallback(
    async (targetPostId: string): Promise<RepostData[]> => {
      if (!ndk) return [];

      const cached = repostDataCacheRef.current.get(targetPostId);
      if (cached) return cached;

      const existing = repostFetchInFlightRef.current.get(targetPostId);
      if (existing) return existing;

      const promise = (async () => {
        try {
          const aCoordinate = getArticleCoordinate();
          const repostsByE = await ndk.fetchEvents({ kinds: [...KINDS_REPOST], '#e': [targetPostId] });
          const repostsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [...KINDS_REPOST], '#a': [aCoordinate] }) : new Set();
          const quoteRepostsByE = await ndk.fetchEvents({ kinds: [KIND_TEXT_NOTE], '#q': [targetPostId] });
          const quoteRepostsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_TEXT_NOTE], '#q': [aCoordinate] }) : new Set();

          const repostsById = new Map<string, NDKEvent>();
          for (const ev of repostsByE) repostsById.set(ev.id, ev);
          for (const ev of repostsByA as Set<NDKEvent>) repostsById.set(ev.id, ev);
          for (const ev of quoteRepostsByE) repostsById.set(ev.id, ev);
          for (const ev of quoteRepostsByA as Set<NDKEvent>) repostsById.set(ev.id, ev);

          const allReposts = Array.from(repostsById.values());
          const baseReposts: RepostData[] = allReposts
            .map((event) => ({
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at || 0,
              kind: event.kind || 6,
              event,
            }))
            .sort((a, b) => b.created_at - a.created_at);

          const uniquePubkeys = new Set(baseReposts.map((repost) => repost.pubkey));
          const profileResults = await Promise.all(
            Array.from(uniquePubkeys).map(async (pubkey) => {
              try {
                const cachedProfile = getAuthorProfile(pubkey);
                if (cachedProfile) return { pubkey, profile: cachedProfile };
                const user = ndk.getUser({ pubkey });
                const profile = await user.fetchProfile();
                if (profile) {
                  updateAuthorProfile(pubkey, {
                    name: profile.name,
                    displayName: profile.displayName,
                    nip05: profile.nip05,
                    image: profile.image,
                    picture: profile.picture,
                  });
                }
                return { pubkey, profile };
              } catch (error) {
                console.error('Error fetching profile for pubkey:', pubkey, error);
                return { pubkey, profile: null };
              }
            })
          );

          const updatedRepostData = baseReposts.map((repost) => {
            const profileResult = profileResults.find((r) => r.pubkey === repost.pubkey);
            if (!profileResult?.profile) return repost;
            const profile = profileResult.profile;
            const authorPicture = 'image' in profile ? profile.image : 'picture' in profile ? profile.picture : undefined;
            return {
              ...repost,
              authorName: profile.displayName || profile.name,
              authorPicture,
            };
          });

          repostDataCacheRef.current.set(targetPostId, updatedRepostData);
          return updatedRepostData;
        } finally {
          repostFetchInFlightRef.current.delete(targetPostId);
        }
      })();

      repostFetchInFlightRef.current.set(targetPostId, promise);
      return promise;
    },
    [getArticleCoordinate, getAuthorProfile, ndk, updateAuthorProfile]
  );

  const fetchReactionStats = useCallback(
    async (targetPostId: string) => {
      if (!ndk) {
        setTopZapBadges([]);
        return;
      }

      setStatsSection((prev) => ({ ...prev, isLoading: true }));

      try {
        const aCoordinate = getArticleCoordinate();

        let likes = 0;
        let comments = 0;
        let zaps = 0;
        let reposts = 0;

        const updateStats = () => {
          setStatsSection({ likes, comments, zaps, reposts, isLoading: true });
        };

        const reactionsByE = await ndk.fetchEvents({ kinds: [KIND_REACTION], '#e': [targetPostId] });
        const reactionsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_REACTION], '#a': [aCoordinate] }) : new Set();
        const reactionsById = new Map<string, NDKEvent>();
        for (const ev of reactionsByE) reactionsById.set(ev.id, ev);
        for (const ev of reactionsByA as Set<NDKEvent>) reactionsById.set(ev.id, ev);
        likes = Array.from(reactionsById.values()).filter((event) => event.content.trim() !== '').length;
        updateStats();

        const nip22ByE = await ndk.fetchEvents({ kinds: [KIND_NIP22_COMMENT], '#e': [targetPostId] });
        const nip22ByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_NIP22_COMMENT], '#a': [aCoordinate] }) : new Set();
        const kind1ByE = await ndk.fetchEvents({ kinds: [KIND_TEXT_NOTE], '#e': [targetPostId] });
        const kind1ByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_TEXT_NOTE], '#a': [aCoordinate] }) : new Set();

        const commentIds = new Set<string>();
        for (const ev of nip22ByE) commentIds.add(ev.id);
        for (const ev of nip22ByA as Set<NDKEvent>) commentIds.add(ev.id);
        for (const ev of kind1ByE) commentIds.add(ev.id);
        for (const ev of kind1ByA as Set<NDKEvent>) commentIds.add(ev.id);
        comments = commentIds.size;
        updateStats();

        const zapsByE = await ndk.fetchEvents({ kinds: [KIND_ZAP], '#e': [targetPostId] });
        const zapsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_ZAP], '#a': [aCoordinate] }) : new Set();
        const uniqueZapsForStats = new Map<string, NDKEvent>();
        for (const ev of zapsByE) uniqueZapsForStats.set(ev.id, ev);
        for (const ev of zapsByA as Set<NDKEvent>) uniqueZapsForStats.set(ev.id, ev);
        zaps = uniqueZapsForStats.size;
        updateStats();

        const parsedZaps = Array.from(uniqueZapsForStats.values())
          .map((ev) => {
            const parsed = parseZapReceiptEvent(ev);
            if (!parsed) return null;
            return {
              id: ev.id,
              created_at: ev.created_at || 0,
              zapperPubkey: parsed.zapperPubkey,
              amount: parsed.amount,
              zapRequestComment: parsed.zapRequestComment,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);

        parsedZaps.sort((a, b) => {
          if (b.amount !== a.amount) return b.amount - a.amount;
          return b.created_at - a.created_at;
        });

        const topSlice = parsedZaps.slice(0, 5);
        const topBadges: TopZapBadge[] = await Promise.all(
          topSlice.map(async (row, index) => {
            let authorName: string | undefined;
            let authorPicture: string | undefined;
            try {
              const profile = await enrichProfile(row.zapperPubkey);
              authorName = profile.authorName;
              authorPicture = profile.authorPicture;
            } catch {
              // Ignore profile fetch failures for header badges.
            }
            return {
              id: row.id,
              pubkey: row.zapperPubkey,
              amount: row.amount,
              authorName,
              authorPicture,
              zapMessage: index === 0 ? row.zapRequestComment : undefined,
            };
          })
        );
        setTopZapBadges(topBadges);

        const repostsByE = await ndk.fetchEvents({ kinds: [...KINDS_REPOST], '#e': [targetPostId] });
        const repostsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [...KINDS_REPOST], '#a': [aCoordinate] }) : new Set();
        const uniqueRepostIds = new Set<string>();
        for (const ev of repostsByE) uniqueRepostIds.add(ev.id);
        for (const ev of repostsByA as Set<NDKEvent>) uniqueRepostIds.add(ev.id);
        reposts = uniqueRepostIds.size;

        setStatsSection({ likes, comments, zaps, reposts, isLoading: false });
        nostrDebug('All reaction stats fetched:', { likes, comments, zaps, reposts });
      } catch (error) {
        console.error('Error fetching reaction stats:', error);
        setStatsSection((prev) => ({ ...prev, isLoading: false }));
        setTopZapBadges([]);
      }
    },
    [enrichProfile, getArticleCoordinate, ndk]
  );

  const fetchRepostDetails = useCallback(
    async (targetPostId: string) => {
      if (!ndk) return;

      const cachedReposts = repostDataCacheRef.current.get(targetPostId);
      if (cachedReposts) {
        setRepostData(cachedReposts);
        setShowRepostsModal(true);
        return;
      }

      setIsLoadingReposts(true);
      setShowRepostsModal(true);

      try {
        const data = await loadRepostDetailsIntoCache(targetPostId);
        setRepostData(data);
      } catch (error) {
        console.error('Error fetching repost details:', error);
      } finally {
        setIsLoadingReposts(false);
      }
    },
    [loadRepostDetailsIntoCache, ndk]
  );

  const fetchZapDetails = useCallback(
    async (targetPostId: string) => {
      if (!ndk) return;

      const cachedZaps = zapDataCacheRef.current.get(targetPostId);
      if (cachedZaps) {
        setZapData(cachedZaps);
        setShowZapsModal(true);
        return;
      }

      setIsLoadingZaps(true);
      setShowZapsModal(true);

      try {
        const data = await loadZapDetailsIntoCache(targetPostId);
        setZapData(data);
      } catch (error) {
        console.error('Error fetching zap details:', error);
      } finally {
        setIsLoadingZaps(false);
      }
    },
    [loadZapDetailsIntoCache, ndk]
  );

  const fetchReactionDetails = useCallback(
    async (targetPostId: string) => {
      if (!ndk) return;

      const cachedReactions = reactionDataCacheRef.current.get(targetPostId);
      if (cachedReactions) {
        setReactionData(cachedReactions);
        setShowReactionsModal(true);
        return;
      }

      setIsLoadingReactions(true);
      setShowReactionsModal(true);

      try {
        const data = await loadReactionDetailsIntoCache(targetPostId);
        setReactionData(data);
      } catch (error) {
        console.error('Error fetching reaction details:', error);
      } finally {
        setIsLoadingReactions(false);
      }
    },
    [loadReactionDetailsIntoCache, ndk]
  );

  const handleRepostsClick = useCallback(() => {
    if (postId) fetchRepostDetails(postId);
  }, [fetchRepostDetails, postId]);

  const handleZapsClick = useCallback(() => {
    if (postId) fetchZapDetails(postId);
  }, [fetchZapDetails, postId]);

  const handleReactionsClick = useCallback(() => {
    if (postId) fetchReactionDetails(postId);
  }, [fetchReactionDetails, postId]);

  const handleZapMenuToggle = useCallback((zapId: string) => {
    setOpenZapMenuId((prev) => (prev === zapId ? null : zapId));
  }, []);

  const closeZapMenu = useCallback(() => {
    setOpenZapMenuId(null);
  }, []);

  const handleReactionMenuToggle = useCallback((reactionId: string) => {
    setOpenReactionMenuId((prev) => (prev === reactionId ? null : reactionId));
  }, []);

  const closeReactionMenu = useCallback(() => {
    setOpenReactionMenuId(null);
  }, []);

  useEffect(() => {
    if (postId) {
      fetchReactionStats(postId);
    } else {
      setTopZapBadges([]);
    }
  }, [fetchReactionStats, postId]);

  /** After the post is known, prefetch full interaction lists so modals open from cache without waiting. */
  useEffect(() => {
    if (!postId || !ndk) return;

    let cancelled = false;

    const prefetch = () => {
      if (cancelled) return;
      void Promise.allSettled([
        loadZapDetailsIntoCache(postId).catch((e) => console.error('Prefetch zaps failed:', e)),
        loadReactionDetailsIntoCache(postId).catch((e) => console.error('Prefetch reactions failed:', e)),
        loadRepostDetailsIntoCache(postId).catch((e) => console.error('Prefetch reposts failed:', e)),
      ]);
    };

    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(() => prefetch(), { timeout: 4000 });
    } else {
      timeoutHandle = setTimeout(prefetch, 1);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [postId, ndk, loadZapDetailsIntoCache, loadReactionDetailsIntoCache, loadRepostDetailsIntoCache]);

  return {
    statsSection,
    topZapBadges,
    showZapsModal,
    setShowZapsModal,
    zapData,
    isLoadingZaps,
    showReactionsModal,
    setShowReactionsModal,
    reactionData,
    isLoadingReactions,
    showRepostsModal,
    setShowRepostsModal,
    repostData,
    isLoadingReposts,
    openReactionMenuId,
    openZapMenuId,
    handleZapMenuToggle,
    closeZapMenu,
    handleReactionMenuToggle,
    closeReactionMenu,
    handleRepostsClick,
    handleZapsClick,
    handleReactionsClick,
    refreshReactionStats: fetchReactionStats,
  };
}
