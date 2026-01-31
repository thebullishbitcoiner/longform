'use client';

import { useParams } from 'next/navigation';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useBlog } from '@/contexts/BlogContext';
import type { BlogPost } from '@/contexts/BlogContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { ArrowUpIcon, HeartIcon, ChatBubbleLeftIcon, BoltIcon, XMarkIcon, PencilIcon, EllipsisVerticalIcon, ArrowPathIcon, PlusIcon } from '@heroicons/react/24/outline';
import { decode } from 'bolt11';
import styles from './page.module.css';
import { useNostr } from '@/contexts/NostrContext';
import { useProStatus } from '@/hooks/useProStatus';
import { getCustomEmojis } from '@/utils/supabase';
import { nip19 } from 'nostr-tools';
import NDK from '@nostr-dev-kit/ndk';
import { resolveNip05 } from '@/utils/nostr';
import Image from 'next/image';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import toast from 'react-hot-toast';
import { extractCustomEmojis, renderCustomEmojis } from '@/utils/emoji';
import { useHighlights, highlightTextInElement } from '@/utils/highlights';
import JsonModal from '@/components/JsonModal';

// Create a standalone NDK instance for public access
const createStandaloneNDK = () => {
  return new NDK({
    explicitRelayUrls: [
      'wss://relay.damus.io',
      'wss://relay.primal.net'
    ]
  });
};

interface ReactionStats {
  likes: number;
  comments: number;
  zaps: number;
  reposts: number;
  isLoading: boolean;
}

interface ZapData {
  id: string;
  pubkey: string;
  amount: number;
  content?: string;
  created_at: number;
  authorName?: string;
  event?: NDKEvent; // NDKEvent for full event data
}

interface ReactionData {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  authorName?: string;
  event: NDKEvent; // Store the full event for emoji processing
}

interface RepostData {
  id: string;
  pubkey: string;
  created_at: number;
  authorName?: string;
  authorPicture?: string;
  kind: number; // 6 for standard reposts, 16 for generic reposts, 1 for quote reposts
  event: NDKEvent; // Store the full event
}

interface CommentData {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  authorName?: string;
  authorPicture?: string;
  kind: number; // 1111 for NIP-22 or 1 for kind 1 comments
  event: NDKEvent; // Store the full event
  parentId?: string; // ID of the parent comment this is replying to
  children: CommentData[]; // Child comments (replies)
  depth: number; // Nesting depth for indentation
}
// Utility function to count total comments including replies
const countTotalComments = (comments: CommentData[]): number => {
  let count = 0;
  comments.forEach(comment => {
    count += 1; // Count this comment
    count += countTotalComments(comment.children); // Count all replies recursively
  });
  return count;
};

// Utility function to close all comment menus
const closeAllCommentMenus = () => {
  const menus = document.querySelectorAll(`.${styles.commentMenu}`);
  menus.forEach(menu => {
    (menu as HTMLElement).style.display = 'none';
  });
};

// Utility function to find a comment by ID recursively
const findCommentById = (comments: CommentData[], id: string): CommentData | null => {
  for (const comment of comments) {
    if (comment.id === id) {
      return comment;
    }
    // Search in children recursively
    const found = findCommentById(comment.children, id);
    if (found) {
      return found;
    }
  }
  return null;
};

// Fallback avatar component
const FallbackAvatar = ({ name, pubkey, styles }: { name?: string, pubkey: string, styles: Record<string, string> }) => {
  const initials = name ? name.slice(0, 2).toUpperCase() : pubkey.slice(0, 2).toUpperCase();
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const colorIndex = pubkey.charCodeAt(0) % colors.length;
  
  return (
    <div 
      className={styles.fallbackAvatar}
      style={{ backgroundColor: colors[colorIndex] }}
    >
      {initials}
    </div>
  );
};

// Component to render a single comment in nested structure
const CommentItem = React.memo(({ 
  comment, 
  showReplyForm, 
  setShowReplyForm, 
  replyText, 
  setReplyText, 
  isAuthenticated, 
  handleReplyButtonClick, 
  handleReplySubmit, 
  isSubmittingReply,
  processCommentContent,
  openCommentJson,
  styles,
  depth
}: { 
  comment: CommentData,
  showReplyForm: string | null,
  setShowReplyForm: (id: string | null) => void,
  replyText: string,
  setReplyText: (text: string) => void,
  isAuthenticated: boolean,
  handleReplyButtonClick: (id: string) => void,
  handleReplySubmit: (id: string) => void,
  isSubmittingReply: boolean,
  processCommentContent: (content: string) => React.ReactNode,
  openCommentJson: (id: string) => void,
  styles: Record<string, string>,
  depth: number
}) => {
  const isReply = depth > 0;
  
  return (
    <div className={`${styles.commentContent} ${isReply ? styles.commentReply : ''}`}>
      <div className={styles.commentHeader}>
        <div className={styles.commentAuthor}>
          {comment.authorPicture ? (
            <Image 
              src={comment.authorPicture} 
              alt="Author" 
              width={32}
              height={32}
              className={styles.commentAuthorAvatar}
            />
          ) : (
            <FallbackAvatar 
              name={comment.authorName}
              pubkey={comment.pubkey}
              styles={styles}
            />
          )}
          <span className={styles.commentAuthorName}>
            {comment.authorName || comment.pubkey.slice(0, 8) + '...'}
          </span>
        </div>
        <div className={styles.commentHeaderRight}>
          <span className={styles.commentDate}>
            {new Date(comment.created_at * 1000).toLocaleDateString()}
          </span>
          <div className={styles.commentActions}>
            <button 
              className={styles.replyButton}
              onClick={(e) => {
                e.stopPropagation();
                handleReplyButtonClick(comment.id);
              }}
              disabled={!isAuthenticated}
            >
              Reply
            </button>
            <div className={styles.commentMenuWrapper}>
              <button className={styles.commentMenuButton} onClick={(e) => {
                e.stopPropagation();
                closeAllCommentMenus(); // Close all other menus first
                const menu = (e.currentTarget.nextSibling as HTMLElement);
                if (menu) {
                  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                }
              }}>
                <EllipsisVerticalIcon className={styles.commentMenuIcon} />
              </button>
              <div className={styles.commentMenu} onClick={(e) => e.stopPropagation()}>
                <button className={styles.commentMenuItem} onClick={() => openCommentJson(comment.id)}>View JSON</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className={styles.commentText}>
        {processCommentContent(comment.content)}
      </div>
      
      {/* Reply Form */}
      {showReplyForm === comment.id && isAuthenticated && (
        <div className={styles.replyForm}>
          <div className={styles.replyFormHeader}>
            <h5>Reply to {comment.authorName || comment.pubkey.slice(0, 8) + '...'}</h5>
            <button 
              className={styles.replyFormClose}
              onClick={() => {
                setShowReplyForm(null);
                setReplyText('');
              }}
            >
              <XMarkIcon className={styles.replyFormCloseIcon} />
            </button>
          </div>
          <textarea
            className={styles.replyTextarea}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            maxLength={1000}
          />
          <div className={styles.replyFormFooter}>
            <span className={styles.replyCharCount}>
              {replyText.length}/1000
            </span>
            <div className={styles.replyFormActions}>
              <button 
                className={styles.replyCancelButton}
                onClick={() => {
                  setShowReplyForm(null);
                  setReplyText('');
                }}
                disabled={isSubmittingReply}
              >
                Cancel
              </button>
              <button 
                className={styles.replySubmitButton}
                onClick={() => handleReplySubmit(comment.id)}
                disabled={!replyText.trim() || isSubmittingReply}
              >
                {isSubmittingReply ? 'Posting...' : 'Post Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
CommentItem.displayName = 'CommentItem';

// Main component to render all comments with nested threading (max 4 levels)
const CommentThread = React.memo(({ 
  comments, 
  showReplyForm, 
  setShowReplyForm, 
  replyText, 
  setReplyText, 
  isAuthenticated, 
  handleReplyButtonClick, 
  handleReplySubmit, 
  isSubmittingReply,
  processCommentContent,
  openCommentJson,
  styles,
  depth = 0
}: { 
  comments: CommentData[],
  showReplyForm: string | null,
  setShowReplyForm: (id: string | null) => void,
  replyText: string,
  setReplyText: (text: string) => void,
  isAuthenticated: boolean,
  handleReplyButtonClick: (id: string) => void,
  handleReplySubmit: (id: string) => void,
  isSubmittingReply: boolean,
  processCommentContent: (content: string) => React.ReactNode,
  openCommentJson: (id: string) => void,
  styles: Record<string, string>,
  depth?: number
}) => {
  const maxDepth = 4;
  
  return (
    <div className={styles.commentThread}>
      {comments.map((comment) => (
        <div key={comment.id} className={depth === 0 ? styles.commentItem : ''} data-depth={depth}>
          <CommentItem
            comment={comment}
            showReplyForm={showReplyForm}
            setShowReplyForm={setShowReplyForm}
            replyText={replyText}
            setReplyText={setReplyText}
            isAuthenticated={isAuthenticated}
            handleReplyButtonClick={handleReplyButtonClick}
            handleReplySubmit={handleReplySubmit}
            isSubmittingReply={isSubmittingReply}
            processCommentContent={processCommentContent}
            openCommentJson={openCommentJson}
            styles={styles}
            depth={depth}
          />
          
          {/* Render children if we haven't reached max depth */}
          {depth < maxDepth && comment.children.length > 0 && (
            <div className={styles.commentChildren}>
              <CommentThread
                comments={comment.children}
                showReplyForm={showReplyForm}
                setShowReplyForm={setShowReplyForm}
                replyText={replyText}
                setReplyText={setReplyText}
                isAuthenticated={isAuthenticated}
                handleReplyButtonClick={handleReplyButtonClick}
                handleReplySubmit={handleReplySubmit}
                isSubmittingReply={isSubmittingReply}
                processCommentContent={processCommentContent}
                openCommentJson={openCommentJson}
                styles={styles}
                depth={depth + 1}
              />
            </div>
          )}
          
          {/* Show collapsed indicator for deep threads */}
          {depth >= maxDepth && comment.children.length > 0 && (
            <div className={styles.collapsedThread}>
              <span className={styles.collapsedIndicator}>
                +{comment.children.length} more replies
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
});
CommentThread.displayName = 'CommentThread';

export default function BlogPost() {
  const params = useParams();
  const { addPost, markPostAsRead, getAuthorProfile, fetchProfileOnce, updateAuthorProfile, getPostByAuthorAndD } = useBlog();
  const { ndk: contextNdk, isAuthenticated, currentUser } = useNostr();
  const { getHighlightsForPost, addHighlight } = useHighlights();
  const { isPro } = useProStatus();
  
  const debugLog = (_message: string, ..._args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] DEBUG: ${_message}`, ..._args);
    }
  };
  
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [processedContent, setProcessedContent] = useState('');
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);
  const [statsSection, setStatsSection] = useState<ReactionStats>({
    likes: 0,
    comments: 0,
    zaps: 0,
    reposts: 0,
    isLoading: false
  });
  const [showZapsModal, setShowZapsModal] = useState(false);
  const [zapData, setZapData] = useState<ZapData[]>([]);
  const [isLoadingZaps, setIsLoadingZaps] = useState(false);
  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [reactionData, setReactionData] = useState<ReactionData[]>([]);
  const [isLoadingReactions, setIsLoadingReactions] = useState(false);
  const [showRepostsModal, setShowRepostsModal] = useState(false);
  const [repostData, setRepostData] = useState<RepostData[]>([]);
  const [isLoadingReposts, setIsLoadingReposts] = useState(false);
  const [isSubmittingHeartReaction, setIsSubmittingHeartReaction] = useState(false);
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<Array<{name: string, url: string}>>([]);
  const [isLoadingCustomEmojis, setIsLoadingCustomEmojis] = useState(false);
  const [preferredEmojis, setPreferredEmojis] = useState<string[]>([]);
  const [showAddEmojiInput, setShowAddEmojiInput] = useState(false);
  const [newEmojiInput, setNewEmojiInput] = useState('');
  
  // Basic emoji options for all users
  const basicEmojis = [
    { emoji: '💜', name: 'Purple Heart' },
    { emoji: '🤙', name: 'Shaka' },
    { emoji: '🫂', name: 'Hug' },
    { emoji: '👍', name: 'Thumbs Up' },
    { emoji: '🧡', name: 'Orange Heart' }
  ];
  
  // Cache refs for modal data (using refs to avoid dependency issues)
  const zapDataCacheRef = useRef<Map<string, ZapData[]>>(new Map());
  const reactionDataCacheRef = useRef<Map<string, ReactionData[]>>(new Map());
  const repostDataCacheRef = useRef<Map<string, RepostData[]>>(new Map());
  
  // Ref to store the latest fetchReactionStatsInBackground function
  const fetchReactionStatsRef = useRef<((postId: string) => Promise<void>) | null>(null);
  
  // Comment section state
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [jsonModal, setJsonModal] = useState<{
    isOpen: boolean;
    data: unknown;
  }>({
    isOpen: false,
    data: null
  });
  const [openReactionMenuId, setOpenReactionMenuId] = useState<string | null>(null);
  const [openZapMenuId, setOpenZapMenuId] = useState<string | null>(null);

  // Comment form state
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  
  // Reply form state
  const [showReplyForm, setShowReplyForm] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

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

  const handleZapMenuToggle = (zapId: string) => {
    setOpenZapMenuId(openZapMenuId === zapId ? null : zapId);
  };

  const closeZapMenu = () => {
    setOpenZapMenuId(null);
  };

  const handleReactionMenuToggle = (reactionId: string) => {
    setOpenReactionMenuId(openReactionMenuId === reactionId ? null : reactionId);
  };

  const closeReactionMenu = () => {
    setOpenReactionMenuId(null);
  };

  const fetchRepostDetails = useCallback(async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    // Check cache first
    const cachedReposts = repostDataCacheRef.current.get(postId);
    if (cachedReposts) {
      setRepostData(cachedReposts);
      setShowRepostsModal(true);
      return;
    }

    setIsLoadingReposts(true);
    setShowRepostsModal(true);

    try {
      // Build article coordinate (a tag)
      const currentDTag = params.d ? decodeURIComponent(params.d as string) : undefined;
      const aCoordinate = post?.pubkey && currentDTag ? `30023:${post.pubkey}:${currentDTag}` : undefined;

      // Fetch reposts (kind 6 - standard reposts, kind 16 - generic reposts) by both '#e' and '#a'
      const repostsByE = await ndkToUse.fetchEvents({ kinds: [6, 16], '#e': [postId] });
      const repostsByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [6, 16], '#a': [aCoordinate] }) : new Set();
      
      // Fetch quote reposts (kind 1 with q tags) by both '#e' and '#a'
      const quoteRepostsByE = await ndkToUse.fetchEvents({ kinds: [1], '#q': [postId] });
      const quoteRepostsByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [1], '#q': [aCoordinate] }) : new Set();

      // Merge and deduplicate all reposts
      const repostsById = new Map<string, NDKEvent>();
      for (const ev of repostsByE) repostsById.set(ev.id, ev);
      for (const ev of repostsByA as Set<NDKEvent>) repostsById.set(ev.id, ev);
      for (const ev of quoteRepostsByE) repostsById.set(ev.id, ev);
      for (const ev of quoteRepostsByA as Set<NDKEvent>) repostsById.set(ev.id, ev);

      const allReposts = Array.from(repostsById.values());

      // Convert to RepostData format
      const repostData: RepostData[] = allReposts.map(event => ({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at || 0,
        kind: event.kind || 6,
        event: event
      }));

      // Sort by creation date (newest first)
      repostData.sort((a, b) => b.created_at - a.created_at);

      setRepostData(repostData);

      // Fetch profiles for repost authors
      const uniquePubkeys = new Set(repostData.map(repost => repost.pubkey));
      const profilePromises = Array.from(uniquePubkeys).map(async (pubkey) => {
        try {
          const cachedProfile = getAuthorProfile(pubkey);
          if (cachedProfile) {
            return { pubkey, profile: cachedProfile };
          } else {
            const user = ndkToUse.getUser({ pubkey });
            const profile = await user.fetchProfile();
            if (profile) {
              // Cache the profile for future use with image data
              updateAuthorProfile(pubkey, {
                name: profile.name,
                displayName: profile.displayName,
                nip05: profile.nip05,
                image: profile.image,
                picture: profile.picture
              });
            }
            return { pubkey, profile };
          }
        } catch (error) {
          console.error('Error fetching profile for pubkey:', pubkey, error);
          return { pubkey, profile: null };
        }
      });

      const profileResults = await Promise.all(profilePromises);
      
      // Update repost data with profile information
      const updatedRepostData = repostData.map(repost => {
        const profileResult = profileResults.find(r => r.pubkey === repost.pubkey);
        if (profileResult && profileResult.profile) {
                  const profile = profileResult.profile;
        const authorPicture = 'image' in profile ? profile.image : 'picture' in profile ? profile.picture : undefined;
        return {
          ...repost,
          authorName: profile.displayName || profile.name,
          authorPicture
        };
        }
        return repost;
      });

      setRepostData(updatedRepostData);
      
      // Cache the results
      repostDataCacheRef.current.set(postId, updatedRepostData);

    } catch (error) {
      console.error('Error fetching repost details:', error);
    } finally {
      setIsLoadingReposts(false);
    }
  }, [contextNdk, standaloneNdk, getAuthorProfile, updateAuthorProfile, post?.pubkey, params.d]);

  const handleRepostsClick = () => {
    if (post?.id) {
      fetchRepostDetails(post.id);
    }
  };

  
  const endOfContentRef = useRef<HTMLDivElement>(null);
  
  const postContentRef = useRef<HTMLDivElement>(null);
  
  // Highlight creation state - using native selection, not managing it ourselves
  const [selectedText, setSelectedText] = useState<string>('');
  const [showHighlightButton, setShowHighlightButton] = useState(false);
  const [highlightButtonPosition, setHighlightButtonPosition] = useState({ top: 0, left: 0 });
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



  const fetchReactionStats = useCallback(async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    setStatsSection(prev => ({ ...prev, isLoading: true }));

    try {
      // Build article coordinate (a tag)
      const currentDTag = params.d ? decodeURIComponent(params.d as string) : undefined;
      const aCoordinate = post?.pubkey && currentDTag ? `30023:${post.pubkey}:${currentDTag}` : undefined;

      // Initialize stats
      let likes = 0;
      let comments = 0;
      let zaps = 0;
      let reposts = 0;

      // Helper function to update stats incrementally
      const updateStats = () => {
        setStatsSection({
          likes,
          comments,
          zaps,
          reposts,
          isLoading: true
        });
      };

      // Fetch and update reactions (kind 7) incrementally
      debugLog('Fetching reactions...');
      const reactionsByE = await ndkToUse.fetchEvents({ kinds: [7], '#e': [postId] });
      const reactionsByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [7], '#a': [aCoordinate] }) : new Set();
      
      // Count reactions across both sources
      const reactionsById = new Map<string, NDKEvent>();
      for (const ev of reactionsByE) reactionsById.set(ev.id, ev);
      for (const ev of reactionsByA as Set<NDKEvent>) reactionsById.set(ev.id, ev);
      const allReactions = Array.from(reactionsById.values()).filter(event => {
        const content = event.content.trim();
        return content !== ''; // Only filter out empty reactions
      });
      likes = allReactions.length;
      debugLog('Reactions fetched:', likes);
      updateStats();

      // Fetch and update comments (kind 1111 - NIP-22) incrementally
      debugLog('Fetching NIP-22 comments...');
      const nip22ByE = await ndkToUse.fetchEvents({ kinds: [1111], '#e': [postId] });
      const nip22ByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [1111], '#a': [aCoordinate] }) : new Set();
      
      // Fetch kind 1 comments (legacy) incrementally
      debugLog('Fetching legacy comments...');
      const kind1ByE = await ndkToUse.fetchEvents({ kinds: [1], '#e': [postId] });
      const kind1ByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [1], '#a': [aCoordinate] }) : new Set();

      // Deduplicate comment ids across sources
      const commentIds = new Set<string>();
      for (const ev of nip22ByE) commentIds.add(ev.id);
      for (const ev of nip22ByA as Set<NDKEvent>) commentIds.add(ev.id);
      for (const ev of kind1ByE) commentIds.add(ev.id);
      for (const ev of kind1ByA as Set<NDKEvent>) commentIds.add(ev.id);
      comments = commentIds.size;
      debugLog('Comments fetched:', comments);
      updateStats();

      // Fetch and update zaps (kind 9735) incrementally
      debugLog('Fetching zaps...');
      const zapsByE = await ndkToUse.fetchEvents({ kinds: [9735], '#e': [postId] });
      const zapsByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [9735], '#a': [aCoordinate] }) : new Set();
      const uniqueZapIds = new Set<string>();
      for (const ev of zapsByE) uniqueZapIds.add(ev.id);
      for (const ev of zapsByA as Set<NDKEvent>) uniqueZapIds.add(ev.id);
      zaps = uniqueZapIds.size;
      debugLog('Zaps fetched:', zaps);
      updateStats();

      // Fetch reposts (kind 6 and 16) incrementally
      debugLog('Fetching reposts...');
      const repostsByE = await ndkToUse.fetchEvents({ kinds: [6, 16], '#e': [postId] });
      const repostsByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [6, 16], '#a': [aCoordinate] }) : new Set();
      const uniqueRepostIds = new Set<string>();
      for (const ev of repostsByE) uniqueRepostIds.add(ev.id);
      for (const ev of repostsByA as Set<NDKEvent>) uniqueRepostIds.add(ev.id);
      reposts = uniqueRepostIds.size;
      debugLog('Reposts fetched:', reposts);
      updateStats();

      // Final update with loading complete
      setStatsSection({
        likes,
        comments,
        zaps,
        reposts,
        isLoading: false
      });

      debugLog('All reaction stats fetched:', { likes, comments, zaps, reposts });

    } catch (error) {
      console.error('Error fetching reaction stats:', error);
      setStatsSection(prev => ({ ...prev, isLoading: false }));
    }
  }, [contextNdk, standaloneNdk, post?.pubkey, params.d]);

  // Store the function in the ref whenever it changes
  useEffect(() => {
    fetchReactionStatsRef.current = fetchReactionStats;
  }, [fetchReactionStats]);

  const loadAdditionalData = useCallback(async (postData: BlogPost) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      debugLog('No NDK available for loading additional data');
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

    debugLog('Loading additional data for post:', postData.id);

    try {
      // Process content to replace npubs with usernames and convert image URLs
      debugLog('Processing content for npubs and images');
      debugLog('Original content:', postData.content.substring(0, 500) + '...');
      let content = await processNpubs(postData.content, ndkToUse);
      content = processImageUrls(content);
      debugLog('Processed content:', content.substring(0, 500) + '...');
      setProcessedContent(content);
      
            // Fetch author profile if not already available
      if (!postData.author) {
        debugLog('Fetching author profile for:', postData.pubkey);
        
        // Check if we already have this profile cached
        const cachedProfile = getAuthorProfile(postData.pubkey);
        if (cachedProfile) {
          debugLog('Using cached profile for:', postData.pubkey);
          const updatedPost = { ...postData, author: cachedProfile };
          setPost(updatedPost);
        } else {
          debugLog('Fetching profile for blog post:', postData.pubkey);
          const profile = await fetchProfileOnce(postData.pubkey, async () => {
            const user = ndkToUse.getUser({ pubkey: postData.pubkey });
            const profile = await user.fetchProfile();
            if (profile) {
              debugLog('Fetched profile:', {
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
            debugLog('No profile found for:', postData.pubkey);
            return null;
          });
          
          if (profile) {
            const updatedPost = { ...postData, author: profile };
            setPost(updatedPost);
            debugLog('Updated post with author profile');
          }
        }
      } else {
        debugLog('Post already has author profile');
      }
      
      debugLog('Additional data loading completed');
    } catch (error) {
      console.error('Error loading additional data:', error);
    }
  }, [contextNdk, standaloneNdk, getAuthorProfile, fetchProfileOnce]);

  const fetchPostByAuthorAndDTag = useCallback(async (pubkey: string, dTag: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      debugLog('No NDK available for fetching post');
      setLoading(false);
      return;
    }

    try {
      debugLog('Fetching events with:', { pubkey, dTag, kind: 30023 });
      
      // Fetch the most recent event with the given author and d tag
      const events = await ndkToUse.fetchEvents({
        kinds: [30023], // Longform posts
        authors: [pubkey],
        '#d': [dTag]
      });

      debugLog('Fetched events count:', events.size);

      if (events.size > 0) {
        // Get the most recent event
        const sortedEvents = Array.from(events).sort((a, b) => b.created_at - a.created_at);
        const event = sortedEvents[0];
        
        debugLog('Selected most recent event:', { 
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

        debugLog('Created post data:', { 
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
        
        debugLog('Post loaded successfully');

        // Only add post to context if user is authenticated (to avoid polluting local storage)
        if (isAuthenticated) {
          addPost(postData);
        }
      } else {
        debugLog('No events found for pubkey and dTag:', { pubkey, dTag });
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
        debugLog('Missing params:', { author: params.author, d: params.d });
        return;
      }

      const ndkToUse = contextNdk || standaloneNdk;
      const author = decodeURIComponent(params.author as string);
      const dTag = decodeURIComponent(params.d as string);
      debugLog('Resolving author:', { author, dTag });

      // If author is already a 64-char hex pubkey, skip NIP-05 resolution
      const isPubkey = /^[0-9a-fA-F]{64}$/.test(author);
      let pubkeyForLookup: string | null = isPubkey ? author : null;

      if (!pubkeyForLookup && ndkToUse) {
        pubkeyForLookup = await resolveNip05(ndkToUse, author);
      }
      if (!pubkeyForLookup) {
        debugLog('No NDK available or could not resolve author');
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
        debugLog('Fetching post with pubkey and dTag:', { pubkey: pubkeyForLookup, dTag });
        await fetchPostByAuthorAndDTag(pubkeyForLookup, dTag);
      } catch (error) {
        console.error('Error resolving author:', error);
        setLoading(false);
      }
    };

    resolveAuthor();
  }, [params.author, params.d, contextNdk, standaloneNdk, fetchPostByAuthorAndDTag, getPostByAuthorAndD, loadAdditionalData]);

  // Fetch reaction stats when post is loaded
  useEffect(() => {
    debugLog('useEffect for reaction stats triggered, post?.id:', post?.id);
    if (post?.id && fetchReactionStatsRef.current) {
      debugLog('Calling fetchReactionStatsInBackground with postId:', post.id);
      fetchReactionStatsRef.current(post.id);
    } else {
      debugLog('No post.id available or function not ready, skipping reaction stats fetch');
    }
  }, [post?.id]);



  const fetchZapDetails = async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    // Check cache first
    const cachedZaps = zapDataCacheRef.current.get(postId);
    if (cachedZaps) {
      setZapData(cachedZaps);
      setShowZapsModal(true);
      return;
    }

    setIsLoadingZaps(true);
    setShowZapsModal(true);

    try {
      // Build article coordinate (a tag)
      const currentDTag = params.d ? decodeURIComponent(params.d as string) : undefined;
      const aCoordinate = post?.pubkey && currentDTag ? `30023:${post.pubkey}:${currentDTag}` : undefined;

      // Fetch zaps (kind 9735) across all versions via '#e' and '#a'
      const zapsByE = await ndkToUse.fetchEvents({ kinds: [9735], '#e': [postId] });
      const zapsByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [9735], '#a': [aCoordinate] }) : new Set();

      // Deduplicate
      const uniqueZaps = new Map<string, NDKEvent>();
      for (const ev of zapsByE) uniqueZaps.set(ev.id, ev);
      for (const ev of zapsByA as Set<NDKEvent>) uniqueZaps.set(ev.id, ev);

      const zapDetails: ZapData[] = [];

      for (const zap of uniqueZaps.values()) {
        try {
          // Parse zap event to extract amount and other details
          const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
          const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
          const zapperPubkeyTag = zap.tags.find(tag => tag[0] === 'P');
          
          // Get the zapper's pubkey from the P tag (not the main pubkey field)
          const zapperPubkey = zapperPubkeyTag?.[1] || zap.pubkey;
          
          let amount = 0;
          let description = '';
          
          // Try to decode bolt11 invoice to get amount
          if (bolt11Tag && bolt11Tag[1]) {
            try {
              const bolt11String = bolt11Tag[1].trim();
              const decoded = decode(bolt11String);
              amount = decoded.satoshis || 0;
              description = decoded.tagsObject?.description || '';
            } catch {
              const amountTag = zap.tags.find(tag => tag[0] === 'amount');
              if (amountTag && amountTag[1]) {
                amount = parseInt(amountTag[1]) / 1000; // Convert from millisats to sats
              }
            }
          } else {
            // Fallback to amount tag if no bolt11 tag
            const amountTag = zap.tags.find(tag => tag[0] === 'amount');
            if (amountTag && amountTag[1]) {
              amount = parseInt(amountTag[1]) / 1000; // Convert from millisats to sats
            }
          }

          // Try to get author name using the zapper's pubkey
          let authorName: string | undefined;
          try {
            const cachedProfile = getAuthorProfile(zapperPubkey);
            if (cachedProfile) {
              authorName = cachedProfile.displayName || cachedProfile.name;
            } else {
              const user = ndkToUse.getUser({ pubkey: zapperPubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                authorName = profile.displayName || profile.name;
                updateAuthorProfile(zapperPubkey, {
                  name: profile.name,
                  displayName: profile.displayName,
                  nip05: profile.nip05,
                  image: profile.image,
                  picture: profile.picture
                });
              }
            }
          } catch {
            // Skip profile fetch failure
          }

          // Use description from bolt11 invoice if available, otherwise fall back to description tag or content
          const finalDescription = description || descriptionTag?.[1] || zap.content || '';

          zapDetails.push({
            id: zap.id,
            pubkey: zapperPubkey, // Store the zapper's pubkey, not the recipient's
            amount,
            content: finalDescription,
            created_at: zap.created_at,
            authorName,
            event: zap // Store the full NDK event
          });
        } catch {
          // Skip malformed zap event
        }
      }

      // Sort by amount (highest first)
      zapDetails.sort((a, b) => b.amount - a.amount);
      setZapData(zapDetails);
      
      // Cache the results
      zapDataCacheRef.current.set(postId, zapDetails);

    } catch (error) {
      console.error('Error fetching zap details:', error);
    } finally {
      setIsLoadingZaps(false);
    }
  };

  const handleZapsClick = () => {
    if (post?.id) {
      fetchZapDetails(post.id);
    }
  };

  const fetchReactionDetails = async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    // Check cache first
    const cachedReactions = reactionDataCacheRef.current.get(postId);
    if (cachedReactions) {
      setReactionData(cachedReactions);
      setShowReactionsModal(true);
      return;
    }

    setIsLoadingReactions(true);
    setShowReactionsModal(true);

    try {
      // Build article coordinate (a tag)
      const currentDTag = params.d ? decodeURIComponent(params.d as string) : undefined;
      const aCoordinate = post?.pubkey && currentDTag ? `30023:${post.pubkey}:${currentDTag}` : undefined;

      // Fetch reactions (kind 7) across all versions via '#e' and '#a'
      const reactionsByE = await ndkToUse.fetchEvents({ kinds: [7], '#e': [postId] });
      const reactionsByA = aCoordinate ? await ndkToUse.fetchEvents({ kinds: [7], '#a': [aCoordinate] }) : new Set();

      // Deduplicate
      const uniqueReactions = new Map<string, NDKEvent>();
      for (const ev of reactionsByE) uniqueReactions.set(ev.id, ev);
      for (const ev of reactionsByA as Set<NDKEvent>) uniqueReactions.set(ev.id, ev);

      const reactionDetails: ReactionData[] = [];

      for (const reaction of uniqueReactions.values()) {
        try {
          const content = reaction.content.trim();
          
          // Skip empty reactions
          if (!content) continue;

          // Try to get author name
          let authorName: string | undefined;
          try {
            const cachedProfile = getAuthorProfile(reaction.pubkey);
            if (cachedProfile) {
              authorName = cachedProfile.displayName || cachedProfile.name;
            } else {
              const user = ndkToUse.getUser({ pubkey: reaction.pubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                authorName = profile.displayName || profile.name;
                // Cache the profile for future use with image data
                updateAuthorProfile(reaction.pubkey, {
                  name: profile.name,
                  displayName: profile.displayName,
                  nip05: profile.nip05,
                  image: profile.image,
                  picture: profile.picture
                });
              }
            }
          } catch (error) {
            console.error('Error fetching reaction author profile:', error);
          }

          reactionDetails.push({
            id: reaction.id,
            pubkey: reaction.pubkey,
            content,
            created_at: reaction.created_at,
            authorName,
            event: reaction
          });
        } catch (error) {
          console.error('Error parsing reaction event:', error);
        }
      }

      // Sort by creation date (newest first)
      reactionDetails.sort((a, b) => b.created_at - a.created_at);
      setReactionData(reactionDetails);
      
      // Cache the results
      reactionDataCacheRef.current.set(postId, reactionDetails);

    } catch (error) {
      console.error('Error fetching reaction details:', error);
    } finally {
      setIsLoadingReactions(false);
    }
  };

  const handleReactionsClick = () => {
    if (post?.id) {
      fetchReactionDetails(post.id);
    }
  };


  // Load custom emojis for PRO and Legend users
  const loadCustomEmojis = useCallback(async () => {
    if (!isPro || !currentUser?.npub) return;
    
    setIsLoadingCustomEmojis(true);
    try {
      const emojis = await getCustomEmojis(currentUser.npub);
      setCustomEmojis(emojis);
    } catch (error) {
      console.error('Error loading custom emojis:', error);
    } finally {
      setIsLoadingCustomEmojis(false);
    }
  }, [isPro, currentUser?.npub]);

  // Load preferred emojis from localStorage
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

  // Save preferred emojis to localStorage
  const savePreferredEmojis = useCallback((emojis: string[]) => {
    try {
      localStorage.setItem('longform_emojis', JSON.stringify(emojis));
      setPreferredEmojis(emojis);
    } catch (error) {
      console.error('Error saving preferred emojis:', error);
    }
  }, []);

  // Add a new preferred emoji
  const addPreferredEmoji = useCallback((emoji: string) => {
    if (emoji && !preferredEmojis.includes(emoji)) {
      const newPreferredEmojis = [...preferredEmojis, emoji];
      savePreferredEmojis(newPreferredEmojis);
    }
  }, [preferredEmojis, savePreferredEmojis]);


  // Load preferred emojis on component mount
  useEffect(() => {
    loadPreferredEmojis();
  }, [loadPreferredEmojis]);

  // Load custom emojis when PRO or Legend status changes
  useEffect(() => {
    if (isPro) {
      loadCustomEmojis();
    } else {
      setCustomEmojis([]);
    }
  }, [isPro, loadCustomEmojis]);

  // Handle heart icon click to open emoji modal
  const handleHeartClick = useCallback(() => {
    if (!isAuthenticated) {
      toast.error('Please log in to react to this post.');
      return;
    }
    setShowEmojiModal(true);
  }, [isAuthenticated]);

  // Handle adding new emoji
  const handleAddEmoji = useCallback(() => {
    if (newEmojiInput.trim()) {
      addPreferredEmoji(newEmojiInput.trim());
      setNewEmojiInput('');
      setShowAddEmojiInput(false);
    }
  }, [newEmojiInput, addPreferredEmoji]);

  // Handle emoji input key press
  const handleEmojiInputKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddEmoji();
    } else if (e.key === 'Escape') {
      setShowAddEmojiInput(false);
      setNewEmojiInput('');
    }
  }, [handleAddEmoji]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback(async (emoji: string) => {
    if (!post || !isAuthenticated) {
      toast.error('Please log in to react to this post.');
      return;
    }

    if (isSubmittingHeartReaction) {
      return; // Prevent multiple submissions
    }

    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      console.error('No NDK instance available');
      return;
    }

    setIsSubmittingHeartReaction(true);
    setShowEmojiModal(false);

    try {
      // Create kind 7 reaction event
      const ndkEvent = new NDKEvent(ndkToUse);
      ndkEvent.kind = 7;
      ndkEvent.content = emoji;
      ndkEvent.created_at = Math.floor(Date.now() / 1000);

      // Get the d tag from the post or URL parameters
      const dTag = post.dTag || (params.d ? decodeURIComponent(params.d as string) : undefined);
      
      // Build article coordinate (a tag)
      const aCoordinate = post.pubkey && dTag ? `30023:${post.pubkey}:${dTag}` : undefined;

      ndkEvent.tags = [
        ['e', post.id], // Reference to the post
        ['p', post.pubkey], // Reference to the post author
      ];

      // Add article coordinate tag if available
      if (aCoordinate) {
        ndkEvent.tags.push(['a', aCoordinate]);
        ndkEvent.tags.push(['k', '30023']); // Kind tag for longform articles
      }

      // Add emoji tag for custom emojis
      if (emoji.startsWith(':') && emoji.endsWith(':')) {
        // This is a custom emoji, find its URL
        const emojiName = emoji.slice(1, -1); // Remove the colons
        const customEmoji = customEmojis.find(ce => ce.name === emojiName);
        if (customEmoji) {
          ndkEvent.tags.push(['emoji', emojiName, customEmoji.url]);
        }
      }

      // Add client tag
      ndkEvent.tags.push(['client', 'Longform._']);
      await ndkEvent.publish();

      // Refresh reaction stats
      if (fetchReactionStatsRef.current) {
        fetchReactionStatsRef.current(post.id);
      }

    } catch {
      toast.error('Failed to create reaction. Please try again.');
    } finally {
      setIsSubmittingHeartReaction(false);
    }
  }, [post, isAuthenticated, contextNdk, standaloneNdk, params.d, fetchReactionStatsRef, isSubmittingHeartReaction, customEmojis]);

  const fetchComments = useCallback(async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    setIsLoadingComments(true);

    try {
      // Build article coordinate (a tag)
      const currentDTag = params.d ? decodeURIComponent(params.d as string) : undefined;
      const aCoordinate = post?.pubkey && currentDTag ? `30023:${post.pubkey}:${currentDTag}` : undefined;

      // Query by multiple tag types to catch all comments:
      // 1. '#e' (event id reference) - for comments that reference the article in lowercase 'e' tag
      // 2. '#E' (event id reference) - for comments that reference the article in uppercase 'E' tag  
      // 3. '#a' (article coordinate reference) - for comments that reference the article coordinate
      const [nip22ByE, nip22ByE_upper, nip22ByA, kind1ByE, kind1ByE_upper, kind1ByA] = await Promise.all([
        ndkToUse.fetchEvents({ kinds: [1111], '#e': [postId], limit: 200 }),
        ndkToUse.fetchEvents({ kinds: [1111], '#E': [postId], limit: 200 }),
        aCoordinate ? ndkToUse.fetchEvents({ kinds: [1111], '#a': [aCoordinate], limit: 200 }) : Promise.resolve(new Set()),
        ndkToUse.fetchEvents({ kinds: [1], '#e': [postId], limit: 500 }),
        ndkToUse.fetchEvents({ kinds: [1], '#E': [postId], limit: 500 }),
        aCoordinate ? ndkToUse.fetchEvents({ kinds: [1], '#a': [aCoordinate], limit: 500 }) : Promise.resolve(new Set()),
      ]);

      // Merge and deduplicate by id
      const combined: NDKEvent[] = [];
      const seen = new Set<string>();
      for (const ev of nip22ByE) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of nip22ByE_upper) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of nip22ByA as Set<NDKEvent>) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of kind1ByE) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of kind1ByE_upper) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of kind1ByA as Set<NDKEvent>) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }

      // First, create comments with basic data (no profile fetching yet)
      const allComments: CommentData[] = combined.map(ev => {
        // Find the parent comment ID
        // For NIP-22 comments, we need to distinguish between:
        // 1. Root comments: only have 'E' tag (article) and 'e' tag (same as article) - no parent
        // 2. Reply comments: have 'E' tag (article) and 'e' tag (different from article) - parent is the 'e' tag
        
        const rootEventId = ev.tags.find(tag => tag[0] === 'E')?.[1]; // Root article event ID
        
        // Look for 'e' tags, prioritizing the one marked as "reply"
        const eTags = ev.tags.filter(tag => tag[0] === 'e');
        const replyTag = eTags.find(tag => tag[3] === 'reply');
        const rootTag = eTags.find(tag => tag[3] === 'root');
        
        let parentId: string | undefined = undefined;
        
        // If there's a reply tag, use that as the parent
        if (replyTag && replyTag[1] && replyTag[1] !== rootEventId) {
          parentId = replyTag[1];
        }
        // Otherwise, if there's a root tag that's different from the article, use that
        else if (rootTag && rootTag[1] && rootTag[1] !== rootEventId) {
          parentId = rootTag[1];
        }
        // Fallback to any 'e' tag that's different from the root article
        else {
          const eTag = eTags.find(tag => tag[1] && tag[1] !== rootEventId);
          if (eTag && eTag[1]) {
            parentId = eTag[1];
          }
        }
        
        return {
        id: ev.id,
        pubkey: ev.pubkey,
        content: ev.content,
        created_at: ev.created_at,
        authorName: undefined, // Will be populated later
        authorPicture: undefined, // Will be populated later
        kind: ev.kind,
        event: ev,
          parentId: parentId,
        children: [],
        depth: 0
        };
      });

      // Sort comments by creation date (newest first)
      allComments.sort((a, b) => b.created_at - a.created_at);
      
      // Build threaded structure
      const commentMap = new Map<string, CommentData>();
      const rootComments: CommentData[] = [];
      
      // First pass: create a map of all comments
      allComments.forEach(comment => {
        commentMap.set(comment.id, comment);
      });
      
      // Second pass: organize into parent-child relationships
      allComments.forEach(comment => {
        if (comment.parentId && commentMap.has(comment.parentId)) {
          // This is a reply to another comment
          const parent = commentMap.get(comment.parentId)!;
          parent.children.push(comment);
          comment.depth = parent.depth + 1;
        } else if (comment.parentId) {
          // This is a reply but parent not found - add as root comment for now
          rootComments.push(comment);
        } else {
          // This is a root comment
          rootComments.push(comment);
        }
      });
      
      // Sort children by creation date (oldest first for replies)
      const sortComments = (comments: CommentData[]) => {
        comments.sort((a, b) => b.created_at - a.created_at); // Sort root comments by newest first
        comments.forEach(comment => {
          if (comment.children.length > 0) {
            // Sort replies by oldest first (standard for threaded discussions)
            comment.children.sort((a, b) => a.created_at - b.created_at);
            sortComments(comment.children);
          }
        });
      };
      sortComments(rootComments);
      
      // Set comments immediately with basic data (no profiles yet)
      setComments(rootComments);

      // Now fetch all profiles in parallel and update comments in one batch
      setIsLoadingProfiles(true);
      const uniquePubkeys = new Set(allComments.map(comment => comment.pubkey));
      const profilePromises = Array.from(uniquePubkeys).map(async (pubkey) => {
        try {
          const cachedProfile = getAuthorProfile(pubkey);
          if (cachedProfile) {
            return { pubkey, profile: cachedProfile };
          } else {
            const user = ndkToUse.getUser({ pubkey });
            const profile = await user.fetchProfile();
            return { pubkey, profile };
          }
        } catch (error) {
          console.error('Error fetching profile for pubkey:', pubkey, error);
          return { pubkey, profile: null };
        }
      });

      // Wait for all profile fetches to complete
      const profileResults = await Promise.all(profilePromises);
      
      // Create a map of pubkey to profile data
      const profileMap = new Map<string, { displayName?: string; name?: string; image?: string; picture?: string }>();
      profileResults.forEach(({ pubkey, profile }) => {
        if (profile) {
          profileMap.set(pubkey, profile);
        }
      });

      // Update all comments with profile data in one batch
      const updateCommentProfiles = (comments: CommentData[]) => {
        comments.forEach(comment => {
          const profile = profileMap.get(comment.pubkey);
          if (profile) {
            comment.authorName = profile.displayName || profile.name;
            comment.authorPicture = profile.image || profile.picture;
          }
          if (comment.children.length > 0) {
            updateCommentProfiles(comment.children);
          }
        });
      };

      updateCommentProfiles(rootComments);
      
      // Update the state with the complete comment data (profiles included)
      setComments([...rootComments]);
      setIsLoadingProfiles(false);

    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  }, [contextNdk, standaloneNdk, getAuthorProfile, updateAuthorProfile, post?.pubkey, params.d]);

  const handleCommentsClick = () => {
    // Scroll to comment section instead of opening modal
    const commentSection = document.querySelector(`.${styles.commentSection}`);
    if (commentSection) {
      commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCommentSubmit = useCallback(async () => {
    if (!commentText.trim() || !post || !isAuthenticated) {
      return;
    }

    const ndkToUse = contextNdk;
    if (!ndkToUse) {
      toast.error('No connection available. Please try again.');
      return;
    }

    setIsSubmittingComment(true);

    try {
      // Create NIP-22 comment event (kind 1111)
      const ndkEvent = new NDKEvent(ndkToUse);
      ndkEvent.kind = 1111;
      ndkEvent.content = commentText.trim();
      
      // Get the d tag from the post or URL parameters
      const dTag = post.dTag || (params.d ? decodeURIComponent(params.d as string) : undefined);
      
      // Build article coordinate (a tag)
      const aCoordinate = `30023:${post.pubkey}:${dTag || post.id}`;
      
      // Add required tags according to NIP-22
      ndkEvent.tags = [
        ['K', '30023'], // Kind of the article being commented on
        ['P', post.pubkey], // Author of the article
        ['E', post.id], // Event ID of the article
        ['A', aCoordinate], // Article coordinate
        ['k', '30023'], // Kind of the article (lowercase)
        ['p', post.pubkey], // Author of the article (lowercase)
        ['e', post.id], // Event ID of the article (lowercase)
        ['a', aCoordinate], // Article coordinate (lowercase)
        ['client', 'Longform._'] // Client identifier
      ];

      ndkEvent.created_at = Math.floor(Date.now() / 1000);
      await ndkEvent.publish();

      setCommentText('');
      setShowCommentForm(false);
      
      // Refresh comments to show the new one
      if (post.id) {
        await fetchComments(post.id);
      }
      
      // Show success message
      toast.success('Comment posted successfully!');
      
    } catch (error) {
      toast.error(`Error posting comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmittingComment(false);
    }
  }, [commentText, post, isAuthenticated, contextNdk, params.d, fetchComments]);

  const handleCommentButtonClick = useCallback(() => {
    if (!isAuthenticated) {
      toast.error('Please log in to comment on this post.');
      return;
    }
    setShowCommentForm(true);
  }, [isAuthenticated]);

  const handleReplySubmit = useCallback(async (parentCommentId: string) => {
    if (!replyText.trim() || !post || !isAuthenticated) {
      return;
    }

    const ndkToUse = contextNdk;
    if (!ndkToUse) {
      toast.error('No connection available. Please try again.');
      return;
    }

    setIsSubmittingReply(true);

    try {
      // Find the parent comment to get its details
      const findCommentById = (comments: CommentData[], id: string): CommentData | null => {
        for (const comment of comments) {
          if (comment.id === id) {
            return comment;
          }
          if (comment.children.length > 0) {
            const found = findCommentById(comment.children, id);
            if (found) return found;
          }
        }
        return null;
      };

      const parentComment = findCommentById(comments, parentCommentId);
      if (!parentComment) {
        toast.error('Parent comment not found');
        return;
      }

      // Create NIP-22 reply event (kind 1111)
      const ndkEvent = new NDKEvent(ndkToUse);
      ndkEvent.kind = 1111;
      ndkEvent.content = replyText.trim();
      
      // Get the d tag from the post or URL parameters
      const dTag = post.dTag || (params.d ? decodeURIComponent(params.d as string) : undefined);
      
      // Build article coordinate (a tag)
      const aCoordinate = `30023:${post.pubkey}:${dTag || post.id}`;
      
      // Add required tags according to NIP-22 for replies
      ndkEvent.tags = [
        // Root event (the article)
        ['E', post.id], // Event ID of the article
        ['K', '30023'], // Kind of the article
        ['P', post.pubkey], // Author of the article
        ['A', aCoordinate], // Article coordinate
        
        // Parent event (the comment being replied to)
        ['e', parentCommentId], // Event ID of the parent comment
        ['k', parentComment.kind.toString()], // Kind of the parent comment (1 or 1111)
        ['p', parentComment.pubkey], // Author of the parent comment
        
        ['client', 'Longform._'] // Client identifier
      ];

      ndkEvent.created_at = Math.floor(Date.now() / 1000);
      await ndkEvent.publish();

      setReplyText('');
      setShowReplyForm(null);
      
      // Refresh comments to show the new reply
      if (post.id) {
        await fetchComments(post.id);
      }
      
      // Show success message
      toast.success('Reply posted successfully!');
      
    } catch (error) {
      toast.error(`Error posting reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmittingReply(false);
    }
  }, [replyText, post, isAuthenticated, contextNdk, params.d, fetchComments, comments]);

  const handleReplyButtonClick = useCallback((commentId: string) => {
    if (!isAuthenticated) {
      toast.error('Please log in to reply to this comment.');
      return;
    }
    setShowReplyForm(commentId);
  }, [isAuthenticated]);

  // Function to process comment content and convert nprofile strings to links
  const processCommentContent = useCallback((content: string) => {
    if (!content || typeof content !== 'string') {
      return content;
    }

    // Process the content by replacing nostr links with React elements
    const nostrLinkRegex = /(nostr:)?(nprofile1[a-zA-Z0-9]+|npub1[a-zA-Z0-9]+|note1[a-zA-Z0-9]+|nevent1[a-zA-Z0-9]+)/g;
    
    const elements: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;
    
    while ((match = nostrLinkRegex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        elements.push(content.slice(lastIndex, match.index));
      }
      
      const fullMatch = match[0]; // The full matched string (including nostr: if present)
      const cleanPart = fullMatch.replace(/^nostr:/, ''); // Remove nostr: prefix
      
      try {
        const decoded = nip19.decode(cleanPart);
        
        switch (decoded.type) {
          case 'nprofile':
            const pubkey = decoded.data.pubkey;
            if (pubkey) {
              const profileUrl = `/profile/${nip19.npubEncode(pubkey)}`;
              const cachedProfile = getAuthorProfile(pubkey);
              const displayName = cachedProfile?.displayName || cachedProfile?.name;
              
              elements.push(
                <Link 
                  key={`nostr-${match.index}`}
                  href={profileUrl}
                  className={styles.nostrLink}
                  onClick={(e) => e.stopPropagation()}
                  title={fullMatch}
                >
                  {displayName ? `@${displayName}` : `@${pubkey.slice(0, 8)}...`}
                </Link>
              );
            } else {
              elements.push(fullMatch);
            }
            break;
          
          case 'npub':
            const npubUrl = `/profile/${cleanPart}`;
            const npubPubkey = decoded.data;
            const npubCachedProfile = getAuthorProfile(npubPubkey);
            const npubDisplayName = npubCachedProfile?.displayName || npubCachedProfile?.name;
            
            elements.push(
              <Link 
                key={`nostr-${match.index}`}
                href={npubUrl}
                className={styles.nostrLink}
                onClick={(e) => e.stopPropagation()}
                title={fullMatch}
              >
                {npubDisplayName ? `@${npubDisplayName}` : `@${npubPubkey.slice(0, 8)}...`}
              </Link>
            );
            break;
          
          case 'note':
            const noteUrl = `https://njump.me/${cleanPart}`;
            elements.push(
              <a 
                key={`nostr-${match.index}`}
                href={noteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.nostrLink}
                onClick={(e) => e.stopPropagation()}
              >
                {fullMatch}
              </a>
            );
            break;
          
          case 'nevent':
            const eventUrl = `https://njump.me/${cleanPart}`;
            elements.push(
              <a 
                key={`nostr-${match.index}`}
                href={eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.nostrLink}
                onClick={(e) => e.stopPropagation()}
              >
                {fullMatch}
              </a>
            );
            break;
          
          default:
            elements.push(fullMatch);
        }
      } catch (error) {
        console.error('Error decoding nostr link:', fullMatch, error);
        elements.push(fullMatch);
      }
      
      lastIndex = match.index + fullMatch.length;
    }
    
    // Add remaining text after the last match
    if (lastIndex < content.length) {
      elements.push(content.slice(lastIndex));
    }
    
    return elements.length > 0 ? elements : content;
  }, [getAuthorProfile]);

  // Fetch comments when post is loaded
  useEffect(() => {
    if (post?.id) {
      fetchComments(post.id);
    }
  }, [post?.id, fetchComments]);

  // Fetch profiles for nostr profile links in comments
  useEffect(() => {
    if (comments.length === 0) return;

    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    // Extract all nostr profile links from comments (both nprofile and npub)
    const nostrProfileRegex = /(nostr:)?(nprofile1[a-zA-Z0-9]+|npub1[a-zA-Z0-9]+)/g;
    const nostrProfileLinks = new Set<string>();
    
    const extractNostrProfiles = (commentList: CommentData[]) => {
      commentList.forEach(comment => {
        const matches = comment.content.match(nostrProfileRegex);
        if (matches) {
          matches.forEach(match => nostrProfileLinks.add(match));
        }
        if (comment.children.length > 0) {
          extractNostrProfiles(comment.children);
        }
      });
    };
    
    extractNostrProfiles(comments);

    // Fetch profiles for nostr profile links that don't have cached profiles
    nostrProfileLinks.forEach(nostrLink => {
      try {
        // Remove "nostr:" prefix if present
        const cleanLink = nostrLink.replace(/^nostr:/, '');
        const decoded = nip19.decode(cleanLink);
        
        if (decoded.type === 'nprofile') {
          const pubkey = decoded.data.pubkey;
          if (pubkey && !getAuthorProfile(pubkey)) {
            // Fetch profile in background
            const user = ndkToUse.getUser({ pubkey });
            user.fetchProfile().catch(error => {
              console.error('Error fetching profile for nprofile link:', error);
            });
          }
        } else if (decoded.type === 'npub') {
          const pubkey = decoded.data;
          if (pubkey && !getAuthorProfile(pubkey)) {
            // Fetch profile in background
            const user = ndkToUse.getUser({ pubkey });
            user.fetchProfile().catch(error => {
              console.error('Error fetching profile for npub link:', error);
            });
          }
        }
      } catch (error) {
        console.error('Error decoding nostr profile link:', error);
      }
    });
  }, [comments, contextNdk, standaloneNdk, getAuthorProfile]);




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







  // Function to update highlight button position based on current selection
  const updateHighlightButtonPosition = useCallback(() => {
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!postContentRef.current || !postContentRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    // Position button near selection (getBoundingClientRect is relative to viewport)
    const rect = range.getBoundingClientRect();
    // Use viewport coordinates directly since button uses fixed positioning
    setHighlightButtonPosition({
      top: rect.bottom + 10, // Position below selection, relative to viewport
      left: rect.left + (rect.width / 2) // Center horizontally on selection
    });
  }, []);

  // Non-intrusive selection change listener - only detects selection, doesn't manage it
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setShowHighlightButton(false);
        setSelectedText('');
        return;
      }

      // Check if selection is within post content
      const range = selection.getRangeAt(0);
      if (!postContentRef.current || !postContentRef.current.contains(range.commonAncestorContainer)) {
        setShowHighlightButton(false);
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      if (text.length > 0) {
        setSelectedText(text);
        updateHighlightButtonPosition();
        setShowHighlightButton(true);
      } else {
        setShowHighlightButton(false);
        setSelectedText('');
      }
    };

    // Listen to selection changes (non-intrusive - just reading, not modifying)
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // Update button position on scroll to keep it aligned with selection
    const handleScroll = () => {
      if (showHighlightButton) {
        updateHighlightButtonPosition();
      }
    };
    
    window.addEventListener('scroll', handleScroll, true); // Use capture phase to catch all scrolls

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showHighlightButton, updateHighlightButtonPosition]);

  // Create highlight function - publishes kind 9802 event
  const createHighlight = useCallback(async () => {
    if (!selectedText.trim() || !post || !isAuthenticated || !currentUser || !contextNdk) {
      return;
    }

    setIsCreatingHighlight(true);

    try {
      // Create kind 9802 highlight event
      const highlightEvent = new NDKEvent(contextNdk);
      highlightEvent.kind = 9802;
      highlightEvent.content = selectedText.trim();
      
      // Add tags
      highlightEvent.tags.push(['e', post.id]); // Post reference
      highlightEvent.tags.push(['p', post.pubkey]); // Post author
      
      // Add 'a' tag for longform article reference (kind:author:dTag)
      if (post.dTag) {
        highlightEvent.tags.push(['a', `30023:${post.pubkey}:${post.dTag}`]);
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
      setShowHighlightButton(false);
      setSelectedText('');

      toast.success('Highlight created!');
    } catch (error) {
      console.error('Error creating highlight:', error);
      toast.error('Failed to create highlight');
    } finally {
      setIsCreatingHighlight(false);
    }
  }, [selectedText, post, isAuthenticated, currentUser, contextNdk, addHighlight]);

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

  // Function to check if a URL is a video link
  const isVideoUrl = (url: string): boolean => {
    const videoPatterns = [
      /youtube\.com\/watch\?v=/,
      /youtu\.be\//,
      /vimeo\.com\//,
      /dailymotion\.com\/video\//,
      /\.mp4$/,
      /\.webm$/,
      /\.ogg$/,
      /\.mov$/,
      /\.avi$/,
      /\.mkv$/,
      /\.wmv$/,
      /\.flv$/,
      /\.m4v$/,
      /\.3gp$/,
      /\.ogv$/
    ];
    
    return videoPatterns.some(pattern => pattern.test(url));
  };

  // Function to get video embed URL
  const getVideoEmbedUrl = (url: string): string | null => {
    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }
    
    // Dailymotion
    const dailymotionMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (dailymotionMatch) {
      return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;
    }
    
    // Direct video files
    const directVideoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.m4v', '.3gp', '.ogv'];
    if (directVideoExtensions.some(ext => url.toLowerCase().includes(ext))) {
      return url;
    }
    
    return null;
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.href;
    if (href.startsWith('nostr:')) {
      e.preventDefault();
    }
  };

  // Stable img component function to prevent re-renders
  const renderImg = useCallback(({ src, alt }: React.ComponentPropsWithoutRef<'img'>) => {
    if (!src || typeof src !== 'string') return null;
    return (
      <img
        src={src}
        alt={alt || 'Image'}
        className={styles.markdownImage}
        style={{ 
          width: '100%', 
          height: 'auto', 
          maxWidth: '100%',
          display: 'block',
          opacity: 1,
          transition: 'none'
        }}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
      />
    );
  }, [styles.markdownImage]);

  // Memoize ReactMarkdown components to prevent re-renders that clear text selection
  // MUST be before any conditional returns to follow Rules of Hooks
  // MINIMAL components - only what's absolutely necessary to avoid interfering with text selection
  const markdownComponents = useMemo(() => ({
    // Only customize what we absolutely need - let ReactMarkdown handle text elements naturally
    // Use stable img renderer to prevent flashing
    img: renderImg,
    a: ({ children, ...props }: React.ComponentPropsWithoutRef<'a'>) => {
      const isNostrLink = props.href?.includes('njump.me');
      const isVideoLink = props.href ? isVideoUrl(props.href) : false;
      const isImageUrl = props.href?.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i);
      
      if (isImageUrl && props.href) {
        return renderImg({ src: props.href, alt: typeof children === 'string' ? children : 'Image' });
      }
      
      if (isVideoLink && props.href) {
        const embedUrl = getVideoEmbedUrl(props.href);
        if (embedUrl) {
          return (
            <span className={styles.videoContainer}>
              {embedUrl.includes('youtube.com/embed') || embedUrl.includes('vimeo.com') || embedUrl.includes('dailymotion.com') ? (
                <iframe
                  src={embedUrl}
                  title="Video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className={styles.videoEmbed}
                />
              ) : (
                <video
                  controls
                  className={styles.videoPlayer}
                  preload="metadata"
                >
                  <source src={embedUrl} type="video/mp4" />
                  <source src={embedUrl} type="video/webm" />
                  <source src={embedUrl} type="video/ogg" />
                  Your browser does not support the video tag.
                </video>
              )}
              <span className={styles.videoCaption}>
                <a href={props.href} target="_blank" rel="noopener noreferrer" className={styles.videoLink}>
                  {children}
                </a>
              </span>
            </span>
          );
        }
      }
      
      const isRegularLink = props.href?.startsWith('http://') || props.href?.startsWith('https://');
      const linkClass = isNostrLink ? styles.nostrLink : isRegularLink ? styles.regularLink : styles.link;
      return (
        <a 
          {...props} 
          onClick={handleLinkClick} 
          className={linkClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },
  }), [styles, handleLinkClick, isVideoUrl, getVideoEmbedUrl, renderImg]);

  // Memoize remarkPlugins to prevent ReactMarkdown re-renders
  const remarkPluginsMemo = useMemo(() => [remarkGfm], []);

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
          {post.image && (
            <div className={styles.postImage}>
              <Image 
                src={post.image} 
                alt={post.title} 
                width={800} 
                height={400} 
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 800px"
                style={{ width: '100%', height: 'auto' }} 
                priority
                unoptimized 
              />
            </div>
          )}

          <header className={styles.header}>
            <h1 className={styles.title}>{post.title}</h1>
            <div className={styles.metadata}>
              <div className={styles.author}>
                <div className={styles.authorLine}>
                  <span className={styles.label}>Author:</span>
                  <Link 
                    href={`/profile/${nip19.npubEncode(post.pubkey)}`}
                    className={styles.authorValue}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    {(() => {
                      // First check if we have author info in the post itself
                      if (post.author?.displayName || post.author?.name) {
                        return post.author.displayName || post.author.name;
                      }
                      
                      // If not, check the centralized author profiles cache
                      const cachedProfile = getAuthorProfile(post.pubkey);
                      if (cachedProfile?.displayName || cachedProfile?.name) {
                        return cachedProfile.displayName || cachedProfile.name;
                      }
                      
                      // Fallback to truncated pubkey
                      return post.pubkey.slice(0, 8) + '...';
                    })()}
                  </Link>
                  {isLoadingAdditionalData && !post.author && !getAuthorProfile(post.pubkey) && (
                    <span className={styles.loadingIndicator}> (loading...)</span>
                  )}
                </div>
                <div className={styles.date}>
                  <span className={styles.label}>Published:</span>
                  <time>
                    {new Date(post.created_at * 1000).toLocaleDateString()}
                    {post.client && (
                      <span className={styles.clientInfo}> via {post.client}</span>
                    )}
                  </time>
                </div>
              </div>
            </div>
            
            {post.tags.length > 0 && (
              <div className={styles.tags}>
                {post.tags.map((tag: string) => (
                  <span key={tag} className={styles.tag}>#{tag}</span>
                ))}
              </div>
            )}
            
            {/* Stats Section */}
            <div className={styles.statsSection}>
              <button className={styles.statItem} onClick={handleZapsClick}>
                {statsSection.zaps} Zap{statsSection.zaps !== 1 ? 's' : ''}
              </button>
              <button className={styles.statItem} onClick={handleReactionsClick}>
                {statsSection.likes} Reaction{statsSection.likes !== 1 ? 's' : ''}
              </button>
              <button className={styles.statItem} onClick={handleCommentsClick}>
                {countTotalComments(comments)} Comment{countTotalComments(comments) !== 1 ? 's' : ''}
              </button>
              <button className={styles.statItem} onClick={handleRepostsClick}>
                {statsSection.reposts} Repost{statsSection.reposts !== 1 ? 's' : ''}
              </button>
            </div>
            
                <div className={styles.actionIcons}>
                  <BoltIcon className={styles.actionIcon} />
              <HeartIcon 
                className={`${styles.actionIcon} ${isSubmittingHeartReaction ? styles.actionIconLoading : ''}`} 
                onClick={handleHeartClick}
              />
                  <ChatBubbleLeftIcon className={styles.actionIcon} />
                  <ArrowPathIcon className={styles.actionIcon} />
                </div>
          </header>

          {post.summary && (
            <div className={styles.summary}>{post.summary}</div>
          )}

          <div 
            className={styles.postContent} 
            ref={postContentRef}
            style={{ 
              userSelect: 'text',
              WebkitUserSelect: 'text',
              MozUserSelect: 'text',
              msUserSelect: 'text'
            }}
          >
            {isLoadingAdditionalData && processedContent === post.content && (
              <div className={styles.processingIndicator}>
                Processing content...
              </div>
            )}
            
            <ReactMarkdown
              remarkPlugins={remarkPluginsMemo}
              components={markdownComponents}
            >
              {processedContent}
            </ReactMarkdown>
            <div ref={endOfContentRef} style={{ height: '1px' }} />
          </div>
        </article>

        {/* Comment Section */}
        <div className={styles.commentSection}>
          <div className={styles.commentSectionHeader}>
            <h3 className={styles.commentSectionTitle}>
              Comments ({countTotalComments(comments)})
            </h3>
            <div className={styles.commentSectionActions}>
            {isLoadingProfiles && (
              <div className={styles.profileLoadingIndicator}>
                <div className={styles.profileLoadingSpinner}></div>
                <span>Loading profiles...</span>
              </div>
            )}
              <button 
                className={styles.commentButton}
                onClick={handleCommentButtonClick}
                disabled={isSubmittingComment}
              >
                {isAuthenticated ? 'Add Comment' : 'Login to Comment'}
              </button>
            </div>
          </div>
          
          {/* Comment Form */}
          {showCommentForm && isAuthenticated && (
            <div className={styles.commentForm}>
              <div className={styles.commentFormHeader}>
                <h4>Write a comment</h4>
                <button 
                  className={styles.commentFormClose}
                  onClick={() => {
                    setShowCommentForm(false);
                    setCommentText('');
                  }}
                >
                  <XMarkIcon className={styles.commentFormCloseIcon} />
                </button>
              </div>
              <textarea
                className={styles.commentTextarea}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Share your thoughts on this post..."
                rows={4}
                maxLength={2000}
              />
              <div className={styles.commentFormFooter}>
                <span className={styles.commentCharCount}>
                  {commentText.length}/2000
                </span>
                <div className={styles.commentFormActions}>
                  <button 
                    className={styles.commentCancelButton}
                    onClick={() => {
                      setShowCommentForm(false);
                      setCommentText('');
                    }}
                    disabled={isSubmittingComment}
                  >
                    Cancel
                  </button>
                  <button 
                    className={styles.commentSubmitButton}
                    onClick={handleCommentSubmit}
                    disabled={!commentText.trim() || isSubmittingComment}
                  >
                    {isSubmittingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {isLoadingComments ? (
            <div className={styles.commentLoading}>
              <div className={styles.commentLoadingSpinner}></div>
              <span>Loading comments...</span>
            </div>
          ) : comments.length === 0 ? (
            <div className={styles.noComments}>
              <ChatBubbleLeftIcon className={styles.noCommentsIcon} />
              <p>No comments yet</p>
              <p className={styles.noCommentsSubtext}>Be the first to share your thoughts!</p>
            </div>
          ) : (
            <div className={styles.commentList}>
              <CommentThread 
                comments={comments}
                showReplyForm={showReplyForm}
                setShowReplyForm={setShowReplyForm}
                replyText={replyText}
                setReplyText={setReplyText}
                isAuthenticated={isAuthenticated}
                handleReplyButtonClick={handleReplyButtonClick}
                handleReplySubmit={handleReplySubmit}
                isSubmittingReply={isSubmittingReply}
                processCommentContent={processCommentContent}
                openCommentJson={openCommentJson}
                styles={styles}
              />
            </div>
          )}
        </div>

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

      {/* Zaps Modal */}
      {showZapsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowZapsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Zaps</h2>
              <button 
                className={styles.modalCloseButton}
                onClick={() => setShowZapsModal(false)}
              >
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {isLoadingZaps ? (
                <div className={styles.modalLoading}>Loading zaps...</div>
              ) : zapData.length === 0 ? (
                <div className={styles.modalEmpty}>No zaps yet</div>
              ) : (
                <div className={styles.zapList}>
                  {zapData.map((zap) => (
                    <div key={zap.id} className={styles.zapItem}>
                      <div className={styles.reactionLeft}>
                        <span className={styles.zapAuthorName}>
                          {zap.authorName || zap.pubkey.slice(0, 8) + '...'}
                        </span>
                        <span className={styles.zapAmount}>
                          ⚡ {zap.amount} sats
                        </span>
                      </div>
                      <div className={styles.reactionRight}>
                        <div className={styles.reactionMenuWrapper}>
                          <button className={styles.reactionMenuButton} onClick={(e) => {
                            e.stopPropagation();
                            handleZapMenuToggle(zap.id);
                          }}>
                            <EllipsisVerticalIcon className={styles.reactionMenuIcon} />
                          </button>
                          <div 
                            className={styles.reactionMenu} 
                            style={{ display: openZapMenuId === zap.id ? 'block' : 'none' }}
                            data-zap-menu={zap.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button className={styles.reactionMenuItem} onClick={() => {
                              // Use the full NDKEvent if available, otherwise fall back to basic data
                              const fullEvent = zap.event ? {
                                id: zap.event.id,
                                pubkey: zap.event.pubkey,
                                created_at: zap.event.created_at,
                                kind: zap.event.kind,
                                tags: zap.event.tags || [],
                                content: zap.event.content,
                                sig: zap.event.sig
                              } : {
                                id: zap.id,
                                pubkey: zap.pubkey,
                                created_at: zap.created_at,
                                kind: 9735,
                                tags: [],
                                content: zap.content || '',
                                sig: ''
                              };
                              setJsonModal({
                                isOpen: true,
                                data: fullEvent
                              });
                              closeZapMenu(); // Close the menu after opening the JSON modal
                            }}>View JSON</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reactions Modal */}
      {showReactionsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowReactionsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Reactions</h2>
              <button 
                className={styles.modalCloseButton}
                onClick={() => setShowReactionsModal(false)}
              >
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {isLoadingReactions ? (
                <div className={styles.modalLoading}>Loading reactions...</div>
              ) : reactionData.length === 0 ? (
                <div className={styles.modalEmpty}>No reactions yet</div>
              ) : (
                                 <div className={styles.reactionList}>
                   {reactionData.map((reaction) => (
                     <div key={reaction.id} className={styles.reactionItem}>
                       <div className={styles.reactionLeft}>
                         <span className={styles.reactionIcon}>
                           {renderReactionContentJSX(reaction.content, reaction.event)}
                         </span>
                         <span className={styles.reactionAuthorName}>
                           {reaction.authorName || reaction.pubkey.slice(0, 8) + '...'}
                         </span>
                       </div>
                                               <div className={styles.reactionRight}>
                          <div className={styles.reactionMenuWrapper}>
                            <button className={styles.reactionMenuButton} onClick={(e) => {
                              e.stopPropagation();
                              handleReactionMenuToggle(reaction.id);
                            }}>
                              <EllipsisVerticalIcon className={styles.reactionMenuIcon} />
                            </button>
                            <div 
                              className={styles.reactionMenu} 
                              style={{ display: openReactionMenuId === reaction.id ? 'block' : 'none' }}
                              data-reaction-menu={reaction.id}
                              onClick={(e) => e.stopPropagation()}
                            >
                                                           <button className={styles.reactionMenuItem} onClick={() => {
                                // Use the full NDKEvent if available, otherwise fall back to basic data
                                const fullEvent = reaction.event ? {
                                  id: reaction.event.id,
                                  pubkey: reaction.event.pubkey,
                                  created_at: reaction.event.created_at,
                                  kind: reaction.event.kind,
                                  tags: reaction.event.tags || [],
                                  content: reaction.event.content,
                                  sig: reaction.event.sig
                                } : {
                                  id: reaction.id,
                                  pubkey: reaction.pubkey,
                                  created_at: reaction.created_at,
                                  kind: 7,
                                  tags: [],
                                  content: reaction.content,
                                  sig: ''
                                };
                                setJsonModal({
                                  isOpen: true,
                                  data: fullEvent
                                });
                                closeReactionMenu(); // Close the menu after opening the JSON modal
                              }}>View JSON</button>
                           </div>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reposts Modal */}
      {showRepostsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRepostsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Reposts</h2>
              <button 
                className={styles.modalCloseButton}
                onClick={() => setShowRepostsModal(false)}
              >
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {isLoadingReposts ? (
                <div className={styles.modalLoading}>Loading reposts...</div>
              ) : repostData.length === 0 ? (
                <div className={styles.modalEmpty}>No reposts yet</div>
              ) : (
                <div className={styles.reactionList}>
                  {repostData.map((repost) => (
                    <div key={repost.id} className={styles.reactionItem}>
                      <div className={styles.reactionLeft}>
                        <span className={styles.reactionIcon}>
                          {repost.kind === 1 ? '💬' : '🔄'}
                        </span>
                        <span className={styles.reactionAuthorName}>
                          {repost.authorName || repost.pubkey.slice(0, 8) + '...'}
                        </span>
                      </div>
                      <div className={styles.reactionRight}>
                        <div className={styles.reactionMenuWrapper}>
                          <button className={styles.reactionMenuButton} onClick={(e) => {
                            e.stopPropagation();
                            handleReactionMenuToggle(repost.id);
                          }}>
                            <EllipsisVerticalIcon className={styles.reactionMenuIcon} />
                          </button>
                          <div 
                            className={styles.reactionMenu} 
                            style={{ display: openReactionMenuId === repost.id ? 'block' : 'none' }}
                            data-reaction-menu={repost.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button className={styles.reactionMenuItem} onClick={() => {
                              // Use the full NDKEvent if available, otherwise fall back to basic data
                              const fullEvent = repost.event ? {
                                id: repost.event.id,
                                pubkey: repost.event.pubkey,
                                created_at: repost.event.created_at,
                                kind: repost.event.kind,
                                tags: repost.event.tags || [],
                                content: repost.event.content,
                                sig: repost.event.sig
                              } : {
                                id: repost.id,
                                pubkey: repost.pubkey,
                                created_at: repost.created_at,
                                kind: repost.kind,
                                tags: [],
                                content: '',
                                sig: ''
                              };
                              setJsonModal({
                                isOpen: true,
                                data: fullEvent
                              });
                              closeReactionMenu(); // Close the menu after opening the JSON modal
                            }}>View JSON</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generic JSON Modal */}
      <JsonModal
        isOpen={jsonModal.isOpen}
        onClose={closeJsonModal}
        data={jsonModal.data}
      />


        {/* Removed all highlight UI components - they were interfering with text selection */}

        {/* Emoji Modal */}
        {showEmojiModal && (
          <div className={styles.emojiModalOverlay}>
            <div 
              className={styles.emojiModal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.emojiMenuContent}>
              <div className={styles.emojiMenuHeader}>
                <span className={styles.emojiMenuTitle}>Send a reaction</span>
                <button 
                  className={styles.emojiMenuClose}
                  onClick={() => setShowEmojiModal(false)}
                >
                  <XMarkIcon className={styles.emojiMenuCloseIcon} />
                </button>
              </div>
              
              <div className={styles.emojiGrid}>
                {basicEmojis.map((emojiData) => (
                  <button
                    key={emojiData.emoji}
                    className={styles.emojiButton}
                    onClick={() => handleEmojiSelect(emojiData.emoji)}
                    title={emojiData.name}
                  >
                    {emojiData.emoji}
                  </button>
                ))}
                
                {/* Preferred emojis */}
                {preferredEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    className={styles.emojiButton}
                    onClick={() => handleEmojiSelect(emoji)}
                    title="Preferred emoji"
                  >
                    {emoji}
                  </button>
                ))}
                
                {/* Add emoji button */}
                {!showAddEmojiInput ? (
                  <button
                    className={styles.emojiButton}
                    onClick={() => setShowAddEmojiInput(true)}
                    title="Add emoji"
                  >
                    <PlusIcon className={styles.plusIcon} />
                  </button>
                ) : (
                  <div className={styles.emojiInputContainer}>
                    <input
                      type="text"
                      value={newEmojiInput}
                      onChange={(e) => setNewEmojiInput(e.target.value)}
                      onKeyDown={handleEmojiInputKeyPress}
                      placeholder="Add emoji"
                      className={styles.emojiInput}
                      autoFocus
                    />
                    <button
                      className={`${styles.emojiButton} ${styles.emojiSymbolButton}`}
                      onClick={handleAddEmoji}
                      title="Add"
                    >
                      ✓
                    </button>
                    <button
                      className={`${styles.emojiButton} ${styles.emojiSymbolButton}`}
                      onClick={() => {
                        setShowAddEmojiInput(false);
                        setNewEmojiInput('');
                      }}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                )}
                
                {/* Custom emojis for PRO and Legend users */}
                {isPro && customEmojis.length > 0 && (
                  <>
                    <div className={styles.emojiDivider} />
                    {customEmojis.map((customEmoji) => (
                      <button
                        key={customEmoji.name}
                        className={styles.emojiButton}
                        onClick={() => handleEmojiSelect(`:${customEmoji.name}:`)}
                        title={customEmoji.name}
                      >
                        <Image 
                          src={customEmoji.url} 
                          alt={`:${customEmoji.name}:`}
                          width={20}
                          height={20}
                          sizes="20px"
                          className={styles.customEmoji}
                          unoptimized
                        />
                      </button>
                    ))}
                  </>
                )}
                
                {isPro && isLoadingCustomEmojis && (
                  <div className={styles.emojiLoading}>
                    Loading custom emojis...
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        )}

      {/* Highlight Button - appears when text is selected */}
      {showHighlightButton && isAuthenticated && (
        <button
          className={styles.highlightButton}
          onClick={createHighlight}
          style={{
            top: `${highlightButtonPosition.top}px`,
            left: `${highlightButtonPosition.left}px`,
          }}
          disabled={isCreatingHighlight}
        >
          <PencilIcon className={styles.highlightButtonIcon} />
          {isCreatingHighlight ? 'Creating...' : 'Highlight'}
        </button>
      )}
    </div>
  );
} 