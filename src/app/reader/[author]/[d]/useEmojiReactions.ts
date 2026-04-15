import { useCallback, useEffect, useMemo, useState } from 'react';
import type NDK from '@nostr-dev-kit/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import toast from 'react-hot-toast';
import { getCustomEmojis } from '@/utils/supabase';
import { KIND_LONGFORM_ARTICLE, KIND_REACTION, longformArticleCoordinate } from '@/nostr/kinds';
import type { BlogPost } from '@/contexts/BlogContext';

interface UseEmojiReactionsParams {
  post: BlogPost | null;
  isAuthenticated: boolean;
  isPro: boolean;
  currentUserNpub?: string;
  ndk: NDK | null;
  dParam?: string;
  refreshReactionStats: (postId: string) => Promise<void>;
}

export function useEmojiReactions({
  post,
  isAuthenticated,
  isPro,
  currentUserNpub,
  ndk,
  dParam,
  refreshReactionStats,
}: UseEmojiReactionsParams) {
  const [isSubmittingHeartReaction, setIsSubmittingHeartReaction] = useState(false);
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<Array<{ name: string; url: string }>>([]);
  const [isLoadingCustomEmojis, setIsLoadingCustomEmojis] = useState(false);
  const [preferredEmojis, setPreferredEmojis] = useState<string[]>([]);
  const [showAddEmojiInput, setShowAddEmojiInput] = useState(false);
  const [newEmojiInput, setNewEmojiInput] = useState('');

  const basicEmojis = useMemo(
    () => [
      { emoji: '💜', name: 'Purple Heart' },
      { emoji: '🤙', name: 'Shaka' },
      { emoji: '🫂', name: 'Hug' },
      { emoji: '👍', name: 'Thumbs Up' },
      { emoji: '🧡', name: 'Orange Heart' },
    ],
    []
  );

  const loadCustomEmojis = useCallback(async () => {
    if (!isPro || !currentUserNpub) return;

    setIsLoadingCustomEmojis(true);
    try {
      const emojis = await getCustomEmojis(currentUserNpub);
      setCustomEmojis(emojis);
    } catch (error) {
      console.error('Error loading custom emojis:', error);
    } finally {
      setIsLoadingCustomEmojis(false);
    }
  }, [currentUserNpub, isPro]);

  const loadPreferredEmojis = useCallback(() => {
    try {
      const stored = localStorage.getItem('longform_emojis');
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferredEmojis(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Error loading preferred emojis:', error);
      setPreferredEmojis([]);
    }
  }, []);

  const savePreferredEmojis = useCallback((emojis: string[]) => {
    try {
      localStorage.setItem('longform_emojis', JSON.stringify(emojis));
      setPreferredEmojis(emojis);
    } catch (error) {
      console.error('Error saving preferred emojis:', error);
    }
  }, []);

  const addPreferredEmoji = useCallback(
    (emoji: string) => {
      if (emoji && !preferredEmojis.includes(emoji)) {
        savePreferredEmojis([...preferredEmojis, emoji]);
      }
    },
    [preferredEmojis, savePreferredEmojis]
  );

  useEffect(() => {
    loadPreferredEmojis();
  }, [loadPreferredEmojis]);

  useEffect(() => {
    if (isPro) {
      loadCustomEmojis();
    } else {
      setCustomEmojis([]);
    }
  }, [isPro, loadCustomEmojis]);

  const handleHeartClick = useCallback(() => {
    if (!isAuthenticated) {
      toast.error('Please log in to react to this post.');
      return;
    }
    setShowEmojiModal(true);
  }, [isAuthenticated]);

  const handleAddEmoji = useCallback(() => {
    if (newEmojiInput.trim()) {
      addPreferredEmoji(newEmojiInput.trim());
      setNewEmojiInput('');
      setShowAddEmojiInput(false);
    }
  }, [addPreferredEmoji, newEmojiInput]);

  const handleEmojiInputKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleAddEmoji();
      } else if (e.key === 'Escape') {
        setShowAddEmojiInput(false);
        setNewEmojiInput('');
      }
    },
    [handleAddEmoji]
  );

  const handleEmojiSelect = useCallback(
    async (emoji: string) => {
      if (!post || !isAuthenticated) {
        toast.error('Please log in to react to this post.');
        return;
      }

      if (isSubmittingHeartReaction) return;
      if (!ndk) {
        console.error('No NDK instance available');
        return;
      }

      setIsSubmittingHeartReaction(true);
      setShowEmojiModal(false);

      try {
        const ndkEvent = new NDKEvent(ndk);
        ndkEvent.kind = KIND_REACTION;
        ndkEvent.content = emoji;
        ndkEvent.created_at = Math.floor(Date.now() / 1000);

        const dTag = post.dTag || dParam;
        const aCoordinate = post.pubkey && dTag ? longformArticleCoordinate(post.pubkey, dTag) : undefined;

        ndkEvent.tags = [
          ['e', post.id],
          ['p', post.pubkey],
        ];

        if (aCoordinate) {
          ndkEvent.tags.push(['a', aCoordinate]);
          ndkEvent.tags.push(['k', String(KIND_LONGFORM_ARTICLE)]);
        }

        if (emoji.startsWith(':') && emoji.endsWith(':')) {
          const emojiName = emoji.slice(1, -1);
          const customEmoji = customEmojis.find((ce) => ce.name === emojiName);
          if (customEmoji) {
            ndkEvent.tags.push(['emoji', emojiName, customEmoji.url]);
          }
        }

        ndkEvent.tags.push(['client', 'Longform._']);
        await ndkEvent.publish();
        await refreshReactionStats(post.id);
      } catch {
        toast.error('Failed to create reaction. Please try again.');
      } finally {
        setIsSubmittingHeartReaction(false);
      }
    },
    [customEmojis, dParam, isAuthenticated, isSubmittingHeartReaction, ndk, post, refreshReactionStats]
  );

  return {
    isSubmittingHeartReaction,
    showEmojiModal,
    setShowEmojiModal,
    customEmojis,
    isLoadingCustomEmojis,
    preferredEmojis,
    showAddEmojiInput,
    setShowAddEmojiInput,
    newEmojiInput,
    setNewEmojiInput,
    basicEmojis,
    handleHeartClick,
    handleAddEmoji,
    handleEmojiInputKeyPress,
    handleEmojiSelect,
  };
}
