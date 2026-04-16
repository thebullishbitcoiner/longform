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
import type { ReactionData, RepostData, ZapData } from './interactionTypes';

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

  const fetchReactionStats = useCallback(
    async (targetPostId: string) => {
      if (!ndk) return;

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
        const uniqueZapIds = new Set<string>();
        for (const ev of zapsByE) uniqueZapIds.add(ev.id);
        for (const ev of zapsByA as Set<NDKEvent>) uniqueZapIds.add(ev.id);
        zaps = uniqueZapIds.size;
        updateStats();

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
      }
    },
    [getArticleCoordinate, ndk]
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

        setRepostData(baseReposts);

        const uniquePubkeys = new Set(baseReposts.map((repost) => repost.pubkey));
        const profileResults = await Promise.all(
          Array.from(uniquePubkeys).map(async (pubkey) => {
            try {
              const cached = getAuthorProfile(pubkey);
              if (cached) return { pubkey, profile: cached };
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

        setRepostData(updatedRepostData);
        repostDataCacheRef.current.set(targetPostId, updatedRepostData);
      } catch (error) {
        console.error('Error fetching repost details:', error);
      } finally {
        setIsLoadingReposts(false);
      }
    },
    [getArticleCoordinate, getAuthorProfile, ndk, updateAuthorProfile]
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
        const aCoordinate = getArticleCoordinate();
        const zapsByE = await ndk.fetchEvents({ kinds: [KIND_ZAP], '#e': [targetPostId] });
        const zapsByA = aCoordinate ? await ndk.fetchEvents({ kinds: [KIND_ZAP], '#a': [aCoordinate] }) : new Set();

        const uniqueZaps = new Map<string, NDKEvent>();
        for (const ev of zapsByE) uniqueZaps.set(ev.id, ev);
        for (const ev of zapsByA as Set<NDKEvent>) uniqueZaps.set(ev.id, ev);

        const zapDetails: ZapData[] = [];
        for (const zap of uniqueZaps.values()) {
          try {
            const bolt11Tag = zap.tags.find((tag) => tag[0] === 'bolt11');
            const descriptionTag = zap.tags.find((tag) => tag[0] === 'description');
            const zapperPubkeyTag = zap.tags.find((tag) => tag[0] === 'P');
            const zapperPubkey = zapperPubkeyTag?.[1] || zap.pubkey;

            let amount = 0;
            let description = '';
            if (bolt11Tag && bolt11Tag[1]) {
              try {
                const decoded = decode(bolt11Tag[1].trim());
                amount = decoded.satoshis || 0;
                description = decoded.tagsObject?.description || '';
              } catch {
                const amountTag = zap.tags.find((tag) => tag[0] === 'amount');
                if (amountTag?.[1]) amount = parseInt(amountTag[1], 10) / 1000;
              }
            } else {
              const amountTag = zap.tags.find((tag) => tag[0] === 'amount');
              if (amountTag?.[1]) amount = parseInt(amountTag[1], 10) / 1000;
            }

            let authorName: string | undefined;
            let authorPicture: string | undefined;
            try {
              const profile = await enrichProfile(zapperPubkey);
              authorName = profile.authorName;
              authorPicture = profile.authorPicture;
            } catch {
              // Ignore profile fetch failures for zaps.
            }

            const finalDescription = description || descriptionTag?.[1] || zap.content || '';
            zapDetails.push({
              id: zap.id,
              pubkey: zapperPubkey,
              amount,
              content: finalDescription,
              created_at: zap.created_at,
              authorName,
              authorPicture,
              event: zap,
            });
          } catch {
            // Skip malformed zap event.
          }
        }

        zapDetails.sort((a, b) => b.amount - a.amount);
        setZapData(zapDetails);
        zapDataCacheRef.current.set(targetPostId, zapDetails);
      } catch (error) {
        console.error('Error fetching zap details:', error);
      } finally {
        setIsLoadingZaps(false);
      }
    },
    [enrichProfile, getArticleCoordinate, ndk]
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
        setReactionData(reactionDetails);
        reactionDataCacheRef.current.set(targetPostId, reactionDetails);
      } catch (error) {
        console.error('Error fetching reaction details:', error);
      } finally {
        setIsLoadingReactions(false);
      }
    },
    [enrichProfile, getArticleCoordinate, ndk]
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
    }
  }, [fetchReactionStats, postId]);

  return {
    statsSection,
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
