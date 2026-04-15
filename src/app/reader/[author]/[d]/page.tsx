'use client';

import { useParams } from 'next/navigation';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ArrowUpIcon } from '@heroicons/react/24/outline';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import toast from 'react-hot-toast';

import JsonModal from '@/components/JsonModal';
import { useBlog } from '@/contexts/BlogContext';
import type { BlogPost } from '@/contexts/BlogContext';
import { useNostr } from '@/contexts/NostrContext';
import { useProStatus } from '@/hooks/useProStatus';
import { nostrDebug } from '@/nostr/debug';
import {
  KIND_HIGHLIGHT,
  KIND_LONGFORM_ARTICLE,
  KIND_REACTION,
  KIND_ZAP,
  longformArticleCoordinate,
} from '@/nostr/kinds';
import { extractCustomEmojis, renderCustomEmojis } from '@/utils/emoji';
import { useHighlights, highlightTextInElement } from '@/utils/highlights';
import { resolveNip05 } from '@/utils/nostr';

import ArticleEngagement from './ArticleEngagement';
import ArticleHeader from './ArticleHeader';
import { countTotalComments, findCommentById } from './commentTypes';
import CommentSection from './CommentSection';
import EmojiReactionModal from './EmojiReactionModal';
import HighlightActionButton from './HighlightActionButton';
import InteractionModals from './InteractionModals';
import MarkdownPostContent from './MarkdownPostContent';
import { useCommentsData } from './useCommentsData';
import { useCommentPresentation } from './useCommentPresentation';
import { useEmojiReactions } from './useEmojiReactions';
import { useHighlightSelection } from './useHighlightSelection';
import { useInteractionData } from './useInteractionData';
import type { ReactionData, RepostData, ZapData } from './interactionTypes';
import styles from './page.module.css';

// Create a standalone NDK instance for public access
const createStandaloneNDK = () => {
  return new NDK({
    explicitRelayUrls: [
      'wss://relay.damus.io',
      'wss://relay.primal.net'
    ]
  });
};

export default function BlogPost() {
  // App + identity context
  const params = useParams();
  const { addPost, markPostAsRead, getAuthorProfile, fetchProfileOnce, updateAuthorProfile, getPostByAuthorAndD } = useBlog();
  const { ndk: contextNdk, isAuthenticated, currentUser } = useNostr();
  const { getHighlightsForPost, addHighlight } = useHighlights();
  const { isPro } = useProStatus();
  
  // Core page state
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [processedContent, setProcessedContent] = useState('');
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);
  
  const [jsonModal, setJsonModal] = useState<{
    isOpen: boolean;
    data: unknown;
  }>({
    isOpen: false,
    data: null
  });

  // Domain hooks
  const ndkToUse = contextNdk || standaloneNdk;
  const {
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
    refreshReactionStats,
  } = useInteractionData({
    ndk: ndkToUse,
    postId: post?.id,
    postPubkey: post?.pubkey,
    dParam: typeof params.d === 'string' ? params.d : undefined,
    getAuthorProfile,
    updateAuthorProfile,
  });

  const {
    comments,
    isLoadingComments,
    isLoadingProfiles,
    showCommentForm,
    setShowCommentForm,
    commentText,
    setCommentText,
    isSubmittingComment,
    handleCommentSubmit,
    handleCommentButtonClick,
    showReplyForm,
    setShowReplyForm,
    replyText,
    setReplyText,
    isSubmittingReply,
    handleReplySubmit,
    handleReplyButtonClick,
  } = useCommentsData({
    readNdk: ndkToUse,
    writeNdk: contextNdk,
    postId: post?.id,
    postPubkey: post?.pubkey,
    postDTag: post?.dTag,
    isAuthenticated,
    dParam: typeof params.d === 'string' ? params.d : undefined,
    getAuthorProfile,
  });

  const {
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
  } = useEmojiReactions({
    post,
    isAuthenticated,
    isPro,
    currentUserNpub: currentUser?.npub,
    ndk: ndkToUse,
    dParam: typeof params.d === 'string' ? decodeURIComponent(params.d) : undefined,
    refreshReactionStats,
  });

  const openCommentJson = useCallback((eventId: string) => {
    const comment = findCommentById(comments, eventId);
    if (comment) {
      const fullEvent = {
        id: comment.event.id,
        pubkey: comment.event.pubkey,
        created_at: comment.event.created_at,
        kind: comment.event.kind,
        tags: comment.event.tags,
        content: comment.event.content,
        sig: comment.event.sig
      };
      setJsonModal({
        isOpen: true,
        data: fullEvent
      });
    }
  }, [comments]);

  const closeJsonModal = () => {
    setJsonModal({
      isOpen: false,
      data: null
    });
  };

  const openZapJson = (zap: ZapData) => {
    const fullEvent = zap.event ? {
      id: zap.event.id,
      pubkey: zap.event.pubkey,
      created_at: zap.event.created_at,
      kind: zap.event.kind,
      tags: zap.event.tags || [],
      content: zap.event.content,
      sig: zap.event.sig,
    } : {
      id: zap.id,
      pubkey: zap.pubkey,
      created_at: zap.created_at,
      kind: KIND_ZAP,
      tags: [],
      content: zap.content || '',
      sig: '',
    };
    setJsonModal({ isOpen: true, data: fullEvent });
    closeZapMenu();
  };

  const openReactionJson = (reaction: ReactionData) => {
    const fullEvent = reaction.event ? {
      id: reaction.event.id,
      pubkey: reaction.event.pubkey,
      created_at: reaction.event.created_at,
      kind: reaction.event.kind,
      tags: reaction.event.tags || [],
      content: reaction.event.content,
      sig: reaction.event.sig,
    } : {
      id: reaction.id,
      pubkey: reaction.pubkey,
      created_at: reaction.created_at,
      kind: KIND_REACTION,
      tags: [],
      content: reaction.content,
      sig: '',
    };
    setJsonModal({ isOpen: true, data: fullEvent });
    closeReactionMenu();
  };

  const openRepostJson = (repost: RepostData) => {
    const fullEvent = repost.event ? {
      id: repost.event.id,
      pubkey: repost.event.pubkey,
      created_at: repost.event.created_at,
      kind: repost.event.kind,
      tags: repost.event.tags || [],
      content: repost.event.content,
      sig: repost.event.sig,
    } : {
      id: repost.id,
      pubkey: repost.pubkey,
      created_at: repost.created_at,
      kind: repost.kind,
      tags: [],
      content: '',
      sig: '',
    };
    setJsonModal({ isOpen: true, data: fullEvent });
    closeReactionMenu();
  };

  
  const endOfContentRef = useRef<HTMLDivElement>(null);
  
  const postContentRef = useRef<HTMLDivElement>(null);
  
  const {
    selectedText,
    showHighlightButton,
    highlightButtonPosition,
    clearHighlightSelection,
  } = useHighlightSelection({ postContentRef });
  const [isCreatingHighlight, setIsCreatingHighlight] = useState(false);


  // Initialize standalone NDK if context NDK is not available
  useEffect(() => {
    if (!contextNdk && !standaloneNdk) {
      const ndk = createStandaloneNDK();
      ndk.connect().then(() => {
        setStandaloneNdk(ndk);
      }).catch(error => {
        console.error('Failed to connect standalone NDK:', error);
      });
    }
  }, [contextNdk, standaloneNdk]);




  const loadAdditionalData = useCallback(async (postData: BlogPost) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      nostrDebug('No NDK available for loading additional data');
      return;
    }

    // Define processNpubs inside useCallback
    const processNpubs = async (content: string, ndk: NDK) => {
      let processedContent = content;
      const npubRegex = /nostr:npub1[a-zA-Z0-9]+/g;
      const npubs = content.match(npubRegex) || [];
      for (const npub of npubs) {
        const npubPart = npub.replace('nostr:', '');
        try {
          const decoded = nip19.decode(npubPart);
          if (decoded.type === 'npub') {
            const hex = decoded.data;
            const user = ndk.getUser({ pubkey: hex });
            const profile = await user.fetchProfile();
            if (profile && (profile.displayName || profile.name)) {
              const username = profile.displayName || profile.name;
              const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
              processedContent = processedContent.replace(npub, njumpLink);
            } else {
              // Use a placeholder if profile fetch failed
              const username = npubPart.slice(0, 8) + '...';
              const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
              processedContent = processedContent.replace(npub, njumpLink);
            }
          }
        } catch (error) {
          console.error('Error processing npub:', error);
          // Use a placeholder if decoding failed
          const username = npubPart.slice(0, 8) + '...';
          const njumpLink = `[@${username}](https://njump.me/${npubPart})`;
          processedContent = processedContent.replace(npub, njumpLink);
        }
      }
      return processedContent;
    };

    // Function to convert image URLs to proper markdown image syntax
    const processImageUrls = (content: string) => {
      let processedContent = content;
      
      // Pattern to match image URLs that are not already in markdown image format
      // This matches URLs ending with common image extensions
      const imageUrlRegex = /(?<![!])\[([^\]]*?\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))\]\(([^)]+)\)/g;
      
      // Replace image URL links with proper markdown image syntax
      processedContent = processedContent.replace(imageUrlRegex, (match, altText, url) => {
        // If the alt text is the same as the URL, use a generic alt text
        const finalAltText = altText === url ? 'Image' : altText;
        return `![${finalAltText}](${url})`;
      });
      
      // Also handle standalone image URLs that might be wrapped in brackets
      const standaloneImageUrlRegex = /\[(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))\]/g;
      processedContent = processedContent.replace(standaloneImageUrlRegex, (match, url) => {
        return `![Image](${url})`;
      });
      
      // Handle cases where the image URL is the same as the link text
      const sameUrlImageRegex = /\[(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))\]\(\1\)/g;
      processedContent = processedContent.replace(sameUrlImageRegex, (match, url) => {
        return `![Image](${url})`;
      });
      
      // Handle cases where the link text is an image URL but the URL might be slightly different
      const imageUrlAsLinkRegex = /\[(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))\]\(([^)]+)\)/g;
      processedContent = processedContent.replace(imageUrlAsLinkRegex, (match, linkText, url) => {
        // If the link text is an image URL, convert it to an image
        if (linkText.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i)) {
          return `![Image](${url})`;
        }
        return match; // Keep original if not an image URL
      });
      
      // Handle plain image URLs that might be on their own line
      const plainImageUrlRegex = /(?<!\()(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))(?!\))/g;
      processedContent = processedContent.replace(plainImageUrlRegex, (match, url) => {
        return `![Image](${url})`;
      });
      
      return processedContent;
    };

    nostrDebug('Loading additional data for post:', postData.id);

    try {
      // Process content to replace npubs with usernames and convert image URLs
      nostrDebug('Processing content for npubs and images');
      nostrDebug('Original content:', postData.content.substring(0, 500) + '...');
      let content = await processNpubs(postData.content, ndkToUse);
      content = processImageUrls(content);
      nostrDebug('Processed content:', content.substring(0, 500) + '...');
      setProcessedContent(content);
      
            // Fetch author profile if not already available
      if (!postData.author) {
        nostrDebug('Fetching author profile for:', postData.pubkey);
        
        // Check if we already have this profile cached
        const cachedProfile = getAuthorProfile(postData.pubkey);
        if (cachedProfile) {
          nostrDebug('Using cached profile for:', postData.pubkey);
          const updatedPost = { ...postData, author: cachedProfile };
          setPost(updatedPost);
        } else {
          nostrDebug('Fetching profile for blog post:', postData.pubkey);
          const profile = await fetchProfileOnce(postData.pubkey, async () => {
            const user = ndkToUse.getUser({ pubkey: postData.pubkey });
            const profile = await user.fetchProfile();
            if (profile) {
              nostrDebug('Fetched profile:', {
                name: profile.name,
                displayName: profile.displayName,
                image: profile.image,
                picture: profile.picture
              });
              return {
                name: profile.name,
                displayName: profile.displayName,
                nip05: profile.nip05,
                image: profile.image,
                picture: profile.picture
              };
            }
            nostrDebug('No profile found for:', postData.pubkey);
            return null;
          });
          
          if (profile) {
            const updatedPost = { ...postData, author: profile };
            setPost(updatedPost);
            nostrDebug('Updated post with author profile');
          }
        }
      } else {
        nostrDebug('Post already has author profile');
      }
      
      nostrDebug('Additional data loading completed');
    } catch (error) {
      console.error('Error loading additional data:', error);
    }
  }, [contextNdk, standaloneNdk, getAuthorProfile, fetchProfileOnce]);

  const fetchPostByAuthorAndDTag = useCallback(async (pubkey: string, dTag: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      nostrDebug('No NDK available for fetching post');
      setLoading(false);
      return;
    }

    try {
      nostrDebug('Fetching events with:', { pubkey, dTag, kind: KIND_LONGFORM_ARTICLE });
      
      // Fetch the most recent event with the given author and d tag
      const events = await ndkToUse.fetchEvents({
        kinds: [KIND_LONGFORM_ARTICLE],
        authors: [pubkey],
        '#d': [dTag]
      });

      nostrDebug('Fetched events count:', events.size);

      if (events.size > 0) {
        // Get the most recent event
        const sortedEvents = Array.from(events).sort((a, b) => b.created_at - a.created_at);
        const event = sortedEvents[0];
        
        nostrDebug('Selected most recent event:', { 
          id: event.id, 
          created_at: event.created_at,
          title: event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled'
        });

        const title = event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled';
        const summary = event.tags.find(tag => tag[0] === 'summary')?.[1] || '';
        const published_at = parseInt(event.tags.find(tag => tag[0] === 'published_at')?.[1] || event.created_at.toString());
        const image = event.tags.find(tag => tag[0] === 'image')?.[1];
        const tags = event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]);
        const client = event.tags.find(tag => tag[0] === 'client')?.[1];

        // Extract emoji tags for custom emoji processing
        const emojiTags = event.tags
          .filter(tag => tag[0] === 'emoji' && tag[1] && tag[2])
          .map(tag => ({ shortcode: tag[1], url: tag[2] }));

        const postData = {
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          content: event.content,
          title,
          summary,
          published_at,
          image,
          tags,
          dTag, // Store the d tag from URL parameters
          emojiTags, // Store emoji tags separately for processing
          client // Store client identifier
        };

        nostrDebug('Created post data:', { 
          id: postData.id, 
          title: postData.title, 
          contentLength: postData.content.length 
        });

        // Show content immediately
        setPost(postData);
        setProcessedContent(event.content);
        setLoading(false);

        // Load additional data in background
        setIsLoadingAdditionalData(true);
        await loadAdditionalData(postData);
        setIsLoadingAdditionalData(false);
        
        nostrDebug('Post loaded successfully');

        // Only add post to context if user is authenticated (to avoid polluting local storage)
        if (isAuthenticated) {
          addPost(postData);
        }
      } else {
        nostrDebug('No events found for pubkey and dTag:', { pubkey, dTag });
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching post:', error);
      setLoading(false);
    }
  }, [contextNdk, standaloneNdk, isAuthenticated, addPost, loadAdditionalData]);

  // Resolve author and fetch post
  useEffect(() => {
    const resolveAuthor = async () => {
      if (!params.author || !params.d) {
        nostrDebug('Missing params:', { author: params.author, d: params.d });
        return;
      }

      const ndkToUse = contextNdk || standaloneNdk;
      const author = decodeURIComponent(params.author as string);
      const dTag = decodeURIComponent(params.d as string);
      nostrDebug('Resolving author:', { author, dTag });

      // If author is already a 64-char hex pubkey, skip NIP-05 resolution
      const isPubkey = /^[0-9a-fA-F]{64}$/.test(author);
      let pubkeyForLookup: string | null = isPubkey ? author : null;

      if (!pubkeyForLookup && ndkToUse) {
        pubkeyForLookup = await resolveNip05(ndkToUse, author);
      }
      if (!pubkeyForLookup) {
        nostrDebug('No NDK available or could not resolve author');
        setLoading(false);
        return;
      }

      // Instant display from BlogContext when we have pubkey (e.g. from reader list)
      if (pubkeyForLookup) {
        const cachedPost = getPostByAuthorAndD(pubkeyForLookup, dTag);
        if (cachedPost) {
          setPost(cachedPost);
          setProcessedContent(cachedPost.content);
          setLoading(false);
          setIsLoadingAdditionalData(true);
          loadAdditionalData(cachedPost).finally(() => setIsLoadingAdditionalData(false));
          if (ndkToUse) {
            fetchPostByAuthorAndDTag(pubkeyForLookup, dTag).catch(() => {});
          }
          return;
        }
      }

      if (!ndkToUse) {
        setLoading(false);
        return;
      }

      try {
        nostrDebug('Fetching post with pubkey and dTag:', { pubkey: pubkeyForLookup, dTag });
        await fetchPostByAuthorAndDTag(pubkeyForLookup, dTag);
      } catch (error) {
        console.error('Error resolving author:', error);
        setLoading(false);
      }
    };

    resolveAuthor();
  }, [params.author, params.d, contextNdk, standaloneNdk, fetchPostByAuthorAndDTag, getPostByAuthorAndD, loadAdditionalData]);
  const handleCommentsClick = () => {
    // Scroll to comment section instead of opening modal
    const commentSection = document.querySelector(`.${styles.commentSection}`);
    if (commentSection) {
      commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };


  // Function to process comment content and convert nprofile strings to links
  const { processCommentContent } = useCommentPresentation({
    comments,
    ndk: ndkToUse,
    getAuthorProfile,
    nostrLinkClassName: styles.nostrLink,
  });




  // Removed all text selection handlers - let browser handle it naturally
  // Removed all highlight mode handlers - they were interfering with text selection

  // Removed handleClickOutside - it was interfering with text selection

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (openReactionMenuId) {
        closeReactionMenu();
      }
      if (openZapMenuId) {
        closeZapMenu();
      }
      // Emoji modal ESC key handling removed - only X button closes it
    }
  }, [openReactionMenuId, openZapMenuId, showEmojiModal]);

  // Removed handleContextMenu - let browser handle context menu naturally


  // Create highlight function - publishes kind 9802 event
  const createHighlight = useCallback(async () => {
    if (!selectedText.trim() || !post || !isAuthenticated || !currentUser || !contextNdk) {
      return;
    }

    setIsCreatingHighlight(true);

    try {
      // Create kind 9802 highlight event
      const highlightEvent = new NDKEvent(contextNdk);
      highlightEvent.kind = KIND_HIGHLIGHT;
      highlightEvent.content = selectedText.trim();
      
      // Add tags
      highlightEvent.tags.push(['e', post.id]); // Post reference
      highlightEvent.tags.push(['p', post.pubkey]); // Post author
      
      // Add 'a' tag for longform article reference (kind:author:dTag)
      if (post.dTag) {
        highlightEvent.tags.push(['a', longformArticleCoordinate(post.pubkey, post.dTag || '')]);
      }

      // Publish the highlight
      await highlightEvent.publish();

      // Add to local state and cache
      const highlight = {
        id: highlightEvent.id,
        content: selectedText.trim(),
        created_at: Date.now(),
        postId: post.id,
        postAuthor: post.pubkey,
        postDTag: post.dTag,
        eventTags: highlightEvent.tags
      };

      addHighlight(highlight);

      // Clear selection and hide button
      window.getSelection()?.removeAllRanges();
      clearHighlightSelection();

      toast.success('Highlight created!');
    } catch (error) {
      console.error('Error creating highlight:', error);
      toast.error('Failed to create highlight');
    } finally {
      setIsCreatingHighlight(false);
    }
  }, [selectedText, post, isAuthenticated, currentUser, contextNdk, addHighlight, clearHighlightSelection]);

  // Minimal event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Note: We don't restore selection during re-renders as it can cause issues
  // Instead, we ensure nothing interferes with the selection process

  // Mark post as read when end of content is reached (only if authenticated)
  useEffect(() => {
    if (!post || hasMarkedAsRead || !endOfContentRef.current || !isAuthenticated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          markPostAsRead(post.id);
          setHasMarkedAsRead(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 } // Trigger when at least 50% of the element is visible
    );

    observer.observe(endOfContentRef.current);

    return () => {
      observer.disconnect();
    };
  }, [post, hasMarkedAsRead, markPostAsRead, isAuthenticated]);

  // Get highlights for the current post - memoized to prevent unnecessary re-renders
  const postHighlights = useMemo(() => {
    return post ? getHighlightsForPost(post.id, post.pubkey, post.dTag) : [];
  }, [post?.id, post?.pubkey, post?.dTag, getHighlightsForPost]);

  // Track if highlights have been applied to prevent re-applying
  const highlightsAppliedRef = useRef(false);

  // Apply highlights to the rendered content after ReactMarkdown finishes
  // This uses DOM manipulation but only after initial render, so it shouldn't interfere with text selection
  useEffect(() => {
    if (postContentRef.current && postHighlights.length > 0 && processedContent && !highlightsAppliedRef.current) {
      // Use a small delay to ensure ReactMarkdown has finished rendering
      const timeoutId = setTimeout(() => {
        if (postContentRef.current && !highlightsAppliedRef.current) {
          highlightTextInElement(postContentRef.current, postHighlights, styles.userHighlight);
          highlightsAppliedRef.current = true;
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [postHighlights, processedContent, styles.userHighlight]);

  // Reset highlights applied flag when post changes
  useEffect(() => {
    highlightsAppliedRef.current = false;
  }, [post?.id]);

  const totalComments = useMemo(() => countTotalComments(comments), [comments]);
  const cachedPostAuthorProfile = useMemo(() => {
    if (!post?.pubkey) return undefined;
    return getAuthorProfile(post.pubkey);
  }, [getAuthorProfile, post?.pubkey]);
  const authorDisplayName = useMemo(() => {
    if (!post) return '';
    if (post.author?.displayName || post.author?.name) {
      return post.author.displayName || post.author.name || '';
    }
    if (cachedPostAuthorProfile?.displayName || cachedPostAuthorProfile?.name) {
      return cachedPostAuthorProfile.displayName || cachedPostAuthorProfile.name || '';
    }
    return `${post.pubkey.slice(0, 8)}...`;
  }, [cachedPostAuthorProfile, post]);
  const showAuthorLoading = useMemo(() => {
    if (!post) return false;
    return isLoadingAdditionalData && !post.author && !cachedPostAuthorProfile;
  }, [cachedPostAuthorProfile, isLoadingAdditionalData, post]);

  // Function to render custom emojis and reactions as JSX
  const renderReactionContentJSX = (content: string, event?: NDKEvent) => {
    try {
      if (!event || !content) {
        return <span>{content || ''}</span>;
      }
      
      // Extract custom emojis from the event's tags
      const emojiMap = extractCustomEmojis(event);
      
      if (emojiMap.size === 0) {
        return <span>{content}</span>;
      }
      
      // Render custom emojis as JSX elements
      const renderedParts = renderCustomEmojis(content, emojiMap);
      
      return <span>{renderedParts}</span>;
    } catch (error) {
      console.error('Error rendering reaction content:', error);
      return <span>{content || ''}</span>;
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p className="loading-text">Loading post...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <div className={styles.notFound}>
            <h1>Post not found</h1>
            <p>The requested post could not be found. This might be because:</p>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>The author identifier is not valid</li>
              <li>The post has been deleted or moved</li>
              <li>The NIP-05 identifier could not be resolved</li>
            </ul>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>


        <article className={styles.post}>
          <ArticleHeader
            post={post}
            authorDisplayName={authorDisplayName}
            showAuthorLoading={showAuthorLoading}
            engagement={(
              <ArticleEngagement
                zaps={statsSection.zaps}
                likes={statsSection.likes}
                comments={totalComments}
                reposts={statsSection.reposts}
                onZapsClick={handleZapsClick}
                onReactionsClick={handleReactionsClick}
                onCommentsClick={handleCommentsClick}
                onRepostsClick={handleRepostsClick}
                onHeartClick={handleHeartClick}
                isSubmittingHeartReaction={isSubmittingHeartReaction}
              />
            )}
          />

          {post.summary && (
            <div className={styles.summary}>{post.summary}</div>
          )}

          <MarkdownPostContent
            processedContent={processedContent}
            originalContent={post.content}
            isLoadingAdditionalData={isLoadingAdditionalData}
            postContentRef={postContentRef}
            endOfContentRef={endOfContentRef}
          />
        </article>

        <CommentSection
          totalComments={totalComments}
          isLoadingProfiles={isLoadingProfiles}
          isSubmittingComment={isSubmittingComment}
          isAuthenticated={isAuthenticated}
          handleCommentButtonClick={handleCommentButtonClick}
          showCommentForm={showCommentForm}
          setShowCommentForm={setShowCommentForm}
          commentText={commentText}
          setCommentText={setCommentText}
          handleCommentSubmit={handleCommentSubmit}
          isLoadingComments={isLoadingComments}
          comments={comments}
          showReplyForm={showReplyForm}
          setShowReplyForm={setShowReplyForm}
          replyText={replyText}
          setReplyText={setReplyText}
          handleReplyButtonClick={handleReplyButtonClick}
          handleReplySubmit={handleReplySubmit}
          isSubmittingReply={isSubmittingReply}
          processCommentContent={processCommentContent}
          openCommentJson={openCommentJson}
        />

        {/* Back to Top Button */}
        <div className={styles.backToTopContainer}>
          <button 
            className={styles.backToTopButton}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
          >
            <ArrowUpIcon className={styles.backToTopIcon} />
            <span>Back to Top</span>
          </button>
        </div>
      </div>

      <InteractionModals
        showZapsModal={showZapsModal}
        setShowZapsModal={setShowZapsModal}
        isLoadingZaps={isLoadingZaps}
        zapData={zapData}
        openZapMenuId={openZapMenuId}
        handleZapMenuToggle={handleZapMenuToggle}
        onZapJson={openZapJson}
        showReactionsModal={showReactionsModal}
        setShowReactionsModal={setShowReactionsModal}
        isLoadingReactions={isLoadingReactions}
        reactionData={reactionData}
        openReactionMenuId={openReactionMenuId}
        handleReactionMenuToggle={handleReactionMenuToggle}
        onReactionJson={openReactionJson}
        renderReactionContentJSX={renderReactionContentJSX}
        showRepostsModal={showRepostsModal}
        setShowRepostsModal={setShowRepostsModal}
        isLoadingReposts={isLoadingReposts}
        repostData={repostData}
        onRepostJson={openRepostJson}
      />

      {/* Generic JSON Modal */}
      <JsonModal
        isOpen={jsonModal.isOpen}
        onClose={closeJsonModal}
        data={jsonModal.data}
      />


        {/* Removed all highlight UI components - they were interfering with text selection */}

      <EmojiReactionModal
        showEmojiModal={showEmojiModal}
        setShowEmojiModal={setShowEmojiModal}
        basicEmojis={basicEmojis}
        preferredEmojis={preferredEmojis}
        showAddEmojiInput={showAddEmojiInput}
        setShowAddEmojiInput={setShowAddEmojiInput}
        newEmojiInput={newEmojiInput}
        setNewEmojiInput={setNewEmojiInput}
        handleEmojiInputKeyPress={handleEmojiInputKeyPress}
        handleAddEmoji={handleAddEmoji}
        handleEmojiSelect={handleEmojiSelect}
        isPro={isPro}
        customEmojis={customEmojis}
        isLoadingCustomEmojis={isLoadingCustomEmojis}
      />

      <HighlightActionButton
        visible={showHighlightButton}
        isAuthenticated={isAuthenticated}
        onClick={createHighlight}
        position={highlightButtonPosition}
        isCreatingHighlight={isCreatingHighlight}
      />
    </div>
  );
} 