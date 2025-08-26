'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useBlog } from '@/contexts/BlogContext';
import type { BlogPost } from '@/contexts/BlogContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { ArrowUpIcon, HeartIcon, ChatBubbleLeftIcon, BoltIcon, XMarkIcon, PencilIcon, EllipsisVerticalIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import styles from './page.module.css';
import { useNostr } from '@/contexts/NostrContext';
import { nip19 } from 'nostr-tools';
import NDK from '@nostr-dev-kit/ndk';
import { resolveNip05 } from '@/utils/nostr';
import Image from 'next/image';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { extractCustomEmojis, renderCustomEmojis } from '@/utils/emoji';
import { useHighlights, highlightTextInElement } from '@/utils/highlights';

// Create a standalone NDK instance for public access
const createStandaloneNDK = () => {
  return new NDK({
    explicitRelayUrls: [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://relay.primal.net',
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://relay.current.fyi',
      'wss://relay.nostr.wirednet.jp',
      'wss://offchain.pub'
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

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface TextSelection {
  text: string;
  startOffset: number;
  endOffset: number;
  container: Node;
}

export default function BlogPost() {
  const params = useParams();
  const { addPost, markPostAsRead, getAuthorProfile, fetchProfileOnce } = useBlog();
  const { ndk: contextNdk, isAuthenticated } = useNostr();
  const { getHighlightsForPost, addHighlight } = useHighlights();
  
  // Helper function for timestamped debug logs
  const debugLog = (message: string, ...args: unknown[]) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] DEBUG: ${message}`, ...args);
  };
  
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [processedContent, setProcessedContent] = useState('');
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);
  const [standaloneNdk, setStandaloneNdk] = useState<NDK | null>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);
  const [reactionStats, setReactionStats] = useState<ReactionStats>({
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
  const [showCommentJsonModal, setShowCommentJsonModal] = useState(false);
  const [selectedCommentJson, setSelectedCommentJson] = useState<string | null>(null);
  const [openReactionMenuId, setOpenReactionMenuId] = useState<string | null>(null);

  const openCommentJson = (eventId: string) => {
    const comment = comments.find(c => c.id === eventId);
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
      setSelectedCommentJson(JSON.stringify(fullEvent, null, 2));
      setShowCommentJsonModal(true);
    }
  };

  const closeCommentJson = () => {
    setShowCommentJsonModal(false);
    setSelectedCommentJson(null);
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
  }, [contextNdk, standaloneNdk, getAuthorProfile, post?.pubkey, params.d]);

  const handleRepostsClick = () => {
    if (post?.id) {
      fetchRepostDetails(post.id);
    }
  };

  // Recursive component to render threaded comments
  const CommentThread = ({ comments, depth = 0 }: { comments: CommentData[], depth?: number }) => {
    // Function to process comment content and convert nprofile strings to links
    const processCommentContent = (content: string) => {
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
    };

    return (
      <div className={styles.commentThread} style={{ marginLeft: `${depth * 20}px` }}>
        {comments.map((comment) => (
          <div key={comment.id} className={styles.commentItem}>
            <div className={styles.commentHeader}>
              <div className={styles.commentAuthor}>
                {comment.authorPicture && (
                  <Image 
                    src={comment.authorPicture} 
                    alt="Author" 
                    width={32}
                    height={32}
                    className={styles.commentAuthorAvatar}
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
                <div className={styles.commentMenuWrapper}>
                  <button className={styles.commentMenuButton} onClick={(e) => {
                    e.stopPropagation();
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
            <div className={styles.commentContent}>
              {processCommentContent(comment.content)}
            </div>
            {comment.children.length > 0 && (
              <CommentThread comments={comment.children} depth={depth + 1} />
            )}
          </div>
        ))}
      </div>
    );
  };
  
  const endOfContentRef = useRef<HTMLDivElement>(null);
  
  // Highlighting state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition>({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const [isCreatingHighlight, setIsCreatingHighlight] = useState(false);
  const postContentRef = useRef<HTMLDivElement>(null);
  


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

    setReactionStats(prev => ({ ...prev, isLoading: true }));

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
        setReactionStats({
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
      setReactionStats({
        likes,
        comments,
        zaps,
        reposts,
        isLoading: false
      });

      debugLog('All reaction stats fetched:', { likes, comments, zaps, reposts });

    } catch (error) {
      console.error('Error fetching reaction stats:', error);
      setReactionStats(prev => ({ ...prev, isLoading: false }));
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
                displayName: profile.displayName
              });
              return {
                name: profile.name,
                displayName: profile.displayName
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
          emojiTags // Store emoji tags separately for processing
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
      if (!ndkToUse) {
        debugLog('No NDK available');
        return;
      }

      try {
        const author = decodeURIComponent(params.author as string);
        const dTag = decodeURIComponent(params.d as string);
        
        debugLog('Resolving author:', { author, dTag });

        // Resolve the author identifier to a pubkey
        const pubkey = await resolveNip05(ndkToUse, author);
        
        debugLog('Resolved pubkey:', { author, pubkey });

        if (pubkey) {
          debugLog('Fetching post with pubkey and dTag:', { pubkey, dTag });
          await fetchPostByAuthorAndDTag(pubkey, dTag);
        } else {
          debugLog('Could not resolve author identifier:', author);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error resolving author:', error);
        setLoading(false);
      }
    };

    resolveAuthor();
  }, [params.author, params.d, contextNdk, standaloneNdk, fetchPostByAuthorAndDTag]);

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
          const amountTag = zap.tags.find(tag => tag[0] === 'amount');
          const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
          
          let amount = 0;
          if (amountTag && amountTag[1]) {
            amount = parseInt(amountTag[1]) / 1000; // Convert from millisats to sats
          }

          // Try to get author name
          let authorName: string | undefined;
          try {
            const cachedProfile = getAuthorProfile(zap.pubkey);
            if (cachedProfile) {
              authorName = cachedProfile.displayName || cachedProfile.name;
            } else {
              const user = ndkToUse.getUser({ pubkey: zap.pubkey });
              const profile = await user.fetchProfile();
              if (profile) {
                authorName = profile.displayName || profile.name;
              }
            }
          } catch (error) {
            console.error('Error fetching zap author profile:', error);
          }

          zapDetails.push({
            id: zap.id,
            pubkey: zap.pubkey,
            amount,
            content: descriptionTag?.[1] || zap.content,
            created_at: zap.created_at,
            authorName
          });
        } catch (error) {
          console.error('Error parsing zap event:', error);
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

  const fetchComments = useCallback(async (postId: string) => {
    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) return;

    setIsLoadingComments(true);

    try {
      // Build article coordinate (a tag)
      const currentDTag = params.d ? decodeURIComponent(params.d as string) : undefined;
      const aCoordinate = post?.pubkey && currentDTag ? `30023:${post.pubkey}:${currentDTag}` : undefined;

      // Query both by '#e' (event id reference) and '#a' (article coordinate reference)
      const [nip22ByE, nip22ByA, kind1ByE, kind1ByA] = await Promise.all([
        ndkToUse.fetchEvents({ kinds: [1111], '#e': [postId], limit: 200 }),
        aCoordinate ? ndkToUse.fetchEvents({ kinds: [1111], '#a': [aCoordinate], limit: 200 }) : Promise.resolve(new Set()),
        ndkToUse.fetchEvents({ kinds: [1], '#e': [postId], limit: 500 }),
        aCoordinate ? ndkToUse.fetchEvents({ kinds: [1], '#a': [aCoordinate], limit: 500 }) : Promise.resolve(new Set()),
      ]);

      // Merge and deduplicate by id
      const combined: NDKEvent[] = [];
      const seen = new Set<string>();
      for (const ev of nip22ByE) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of nip22ByA as Set<NDKEvent>) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of kind1ByE) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }
      for (const ev of kind1ByA as Set<NDKEvent>) if (!seen.has(ev.id)) { combined.push(ev); seen.add(ev.id); }

      // First, create comments with basic data (no profile fetching yet)
      const allComments: CommentData[] = combined.map(ev => ({
        id: ev.id,
        pubkey: ev.pubkey,
        content: ev.content,
        created_at: ev.created_at,
        authorName: undefined, // Will be populated later
        authorPicture: undefined, // Will be populated later
        kind: ev.kind,
        event: ev,
        parentId: ev.tags.find(tag => tag[0] === 'e')?.[1], // Assuming 'e' tag is the parent event
        children: [],
        depth: 0
      }));

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
  }, [contextNdk, standaloneNdk, getAuthorProfile, post?.pubkey, params.d]);

  const handleCommentsClick = () => {
    // Scroll to comment section instead of opening modal
    const commentSection = document.querySelector(`.${styles.commentSection}`);
    if (commentSection) {
      commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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



  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setShowContextMenu(false);
      setSelectedText(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedTextString = selection.toString().trim();
    
    if (selectedTextString.length === 0) {
      setShowContextMenu(false);
      setSelectedText(null);
      return;
    }

    // Check if selection is within the post content
    if (!postContentRef.current?.contains(range.commonAncestorContainer)) {
      setShowContextMenu(false);
      setSelectedText(null);
      return;
    }

    // Ensure we have a valid selection
    if (selectedTextString.length < 1) {
      setShowContextMenu(false);
      setSelectedText(null);
      return;
    }

    // Calculate absolute position within the post content
    let absoluteStartOffset = 0;
    let absoluteEndOffset = 0;
    
    if (postContentRef.current) {
      const walker = document.createTreeWalker(
        postContentRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );

      let currentNode: Text | null;
      let currentOffset = 0;
      let startFound = false;
      let endFound = false;

      console.log('🔍 Calculating absolute position for selection:', {
        selectedText: selectedTextString,
        rangeStartOffset: range.startOffset,
        rangeEndOffset: range.endOffset,
        startContainer: range.startContainer,
        endContainer: range.endContainer
      });

      while (currentNode = walker.nextNode() as Text) {
        const nodeLength = currentNode.textContent?.length || 0;
        
        // Check if this node contains the start of the selection
        if (currentNode === range.startContainer) {
          absoluteStartOffset = currentOffset + range.startOffset;
          startFound = true;
          console.log('🔍 Found start position:', {
            nodeText: currentNode.textContent?.substring(0, 50) + '...',
            currentOffset,
            rangeStartOffset: range.startOffset,
            absoluteStartOffset
          });
        }
        
        // Check if this node contains the end of the selection
        if (currentNode === range.endContainer) {
          absoluteEndOffset = currentOffset + range.endOffset;
          endFound = true;
          console.log('🔍 Found end position:', {
            nodeText: currentNode.textContent?.substring(0, 50) + '...',
            currentOffset,
            rangeEndOffset: range.endOffset,
            absoluteEndOffset
          });
          break; // We found both start and end, so we can stop
        }
        
        currentOffset += nodeLength;
      }

      // If we didn't find the exact nodes, fall back to text content matching
      if (!startFound || !endFound) {
        console.log('🔍 Falling back to text content matching');
        const postText = postContentRef.current.textContent || '';
        const startIndex = postText.indexOf(selectedTextString);
        if (startIndex !== -1) {
          absoluteStartOffset = startIndex;
          absoluteEndOffset = startIndex + selectedTextString.length;
          console.log('🔍 Text matching found positions:', {
            startIndex,
            absoluteStartOffset,
            absoluteEndOffset
          });
        } else {
          // Fallback to relative offsets if text matching fails
          absoluteStartOffset = range.startOffset;
          absoluteEndOffset = range.endOffset;
          console.log('🔍 Using fallback relative offsets:', {
            absoluteStartOffset,
            absoluteEndOffset
          });
        }
      }

      console.log('🔍 Final calculated positions:', {
        absoluteStartOffset,
        absoluteEndOffset,
        selectedTextLength: selectedTextString.length
      });
    }

    // Get the position for the context menu
    const rect = range.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    
    // Calculate initial position
    let x = rect.left + rect.width / 2;
    let y = rect.top - 10;
    
    // Ensure the context menu stays within viewport bounds
    const menuWidth = 120; // Approximate menu width
    const menuHeight = 40; // Approximate menu height
    
    if (x + menuWidth / 2 > viewportWidth) {
      x = viewportWidth - menuWidth / 2 - 10;
    } else if (x - menuWidth / 2 < 0) {
      x = menuWidth / 2 + 10;
    }
    
    if (y - menuHeight < 0) {
      y = rect.bottom + 10;
    }
    
    setContextMenuPosition({ x, y });

    setSelectedText({
      text: selectedTextString,
      startOffset: absoluteStartOffset,
      endOffset: absoluteEndOffset,
      container: range.commonAncestorContainer
    });

    setShowContextMenu(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    // Small delay to ensure selection is complete
    setTimeout(handleTextSelection, 50);
  }, [handleTextSelection]);



  const handleClickOutside = useCallback((event: MouseEvent) => {
    const target = event.target as Element;
    
    // Handle text selection context menu
    if (showContextMenu) {
      const contextMenu = document.querySelector(`.${styles.contextMenu}`);
      
      if (!contextMenu || !contextMenu.contains(target)) {
        setShowContextMenu(false);
        setSelectedText(null);
        window.getSelection()?.removeAllRanges();
      }
    }
    
    // Handle reaction context menus
    if (openReactionMenuId) {
      const reactionMenu = document.querySelector(`[data-reaction-menu="${openReactionMenuId}"]`);
      
      if (!reactionMenu || !reactionMenu.contains(target)) {
        closeReactionMenu();
      }
    }
  }, [showContextMenu, openReactionMenuId]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (showContextMenu) {
        setShowContextMenu(false);
        setSelectedText(null);
        window.getSelection()?.removeAllRanges();
      }
      if (openReactionMenuId) {
        closeReactionMenu();
      }
    }
  }, [showContextMenu, openReactionMenuId]);

  const handleContextMenu = useCallback((event: MouseEvent) => {
    // Prevent native context menu on all devices to avoid flashing
    event.preventDefault();
  }, []);







  const createHighlight = async () => {
    console.log('createHighlight called', { selectedText, post, isAuthenticated });
    
    if (!selectedText || !post || !isAuthenticated) {
      console.log('Missing required data:', { 
        hasSelectedText: !!selectedText, 
        hasPost: !!post, 
        isAuthenticated 
      });
      return;
    }

    // Clean the selected text to remove any HTML tags or extra whitespace
    const cleanText = selectedText.text.replace(/\s+/g, ' ').trim();
    if (cleanText.length === 0) {
      console.log('Selected text is empty after cleaning');
      return;
    }

    const ndkToUse = contextNdk || standaloneNdk;
    if (!ndkToUse) {
      console.error('No NDK available for creating highlight');
      alert('No connection available. Please try again.');
      return;
    }

    console.log('Creating highlight with:', {
      cleanText,
      postId: post.id,
      postPubkey: post.pubkey,
      ndkType: contextNdk ? 'context' : 'standalone'
    });

    setIsCreatingHighlight(true);

    try {
      // Create kind 9802 event according to NIP-84
      const ndkEvent = new NDKEvent(ndkToUse);
      ndkEvent.kind = 9802;
      ndkEvent.content = cleanText;
      ndkEvent.tags = [
        ['e', post.id], // Reference to the highlighted post
        ['p', post.pubkey], // Reference to the post author
        ['a', `30023:${post.pubkey}:${post.id}`], // Reference to the post as a longform article
        ['client', 'Longform._']
      ];

      // Add position information if available
      if (selectedText.startOffset !== undefined && selectedText.endOffset !== undefined) {
        ndkEvent.tags.push(['start', selectedText.startOffset.toString()]);
        ndkEvent.tags.push(['end', selectedText.endOffset.toString()]);
        console.log('🔍 Adding position tags to Nostr event:', {
          start: selectedText.startOffset,
          end: selectedText.endOffset,
          selectedText: selectedText.text
        });
      } else {
        console.log('🔍 No position information available for highlight');
      }

      ndkEvent.created_at = Math.floor(Date.now() / 1000);

      console.log('Publishing highlight event:', {
        kind: ndkEvent.kind,
        content: ndkEvent.content,
        tags: ndkEvent.tags,
        created_at: ndkEvent.created_at
      });

      // Publish the highlight event
      await ndkEvent.publish();
      
      console.log('Highlight created successfully:', ndkEvent.id);
      
      // Add the new highlight to our cache and local state
      const newHighlight = {
        id: ndkEvent.id,
        content: cleanText,
        created_at: Date.now(),
        postId: post.id,
        postAuthor: post.pubkey,
        startOffset: selectedText.startOffset,
        endOffset: selectedText.endOffset,
        eventTags: ndkEvent.tags
      };
      
      // Add to highlights cache
      addHighlight(newHighlight);
      
      // Re-apply highlights to the content
      if (postContentRef.current) {
        const postHighlights = getHighlightsForPost(post.id);
        highlightTextInElement(postContentRef.current, postHighlights, styles.userHighlight);
      }
      
      // Show success message (you can replace this with a toast notification)
      alert('Highlight created successfully!');
      
      // Clear selection and hide context menu
      window.getSelection()?.removeAllRanges();
      setShowContextMenu(false);
      setSelectedText(null);
      
    } catch (error) {
      console.error('Error creating highlight:', error);
      alert(`Error creating highlight: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingHighlight(false);
    }
  };

  // Add event listeners for text selection
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleMouseUp, handleClickOutside, handleKeyDown, handleContextMenu]);

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

  // Apply highlights to post content when it's loaded and highlights are available
  useEffect(() => {
    if (!post || !postContentRef.current || !isAuthenticated) return;

    // Small delay to ensure content is fully rendered
    const timer = setTimeout(() => {
      const postHighlights = getHighlightsForPost(post.id);
      
      if (postHighlights.length > 0) {
        console.log(`🔍 Applied ${postHighlights.length} highlights to post content`);
        highlightTextInElement(postContentRef.current!, postHighlights, styles.userHighlight);
      }
    }, 1000); // Delay to ensure content is fully rendered

    return () => clearTimeout(timer);
  }, [post, getHighlightsForPost, isAuthenticated]);

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
      // Handle nostr links (you can add specific handling here)
      console.log('Nostr link clicked:', href);
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
              <Image src={post.image} alt={post.title} width={800} height={400} style={{ width: '100%', height: 'auto' }} />
            </div>
          )}

          <header className={styles.header}>
            <h1 className={styles.title}>{post.title}</h1>
            <div className={styles.metadata}>
              <div className={styles.author}>
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
                <time>{new Date(post.created_at * 1000).toLocaleDateString()}</time>
              </div>
            </div>
            
            {/* Reaction Stats */}
            <div className={styles.reactionStats}>
              <div className={styles.reactionItem} onClick={handleZapsClick} style={{ cursor: 'pointer' }}>
                <BoltIcon className={styles.reactionIcon} />
                <span className={styles.reactionCount}>
                  {reactionStats.zaps}
                </span>
                <span className={styles.reactionLabel}>Zaps</span>
              </div>
              <div className={styles.reactionItem} onClick={handleReactionsClick} style={{ cursor: 'pointer' }}>
                <HeartIcon className={styles.reactionIcon} />
                <span className={styles.reactionCount}>
                  {reactionStats.likes}
                </span>
                <span className={styles.reactionLabel}>Reactions</span>
              </div>
              <div className={styles.reactionItem} onClick={handleCommentsClick} style={{ cursor: 'pointer' }}>
                <ChatBubbleLeftIcon className={styles.reactionIcon} />
                <span className={styles.reactionCount}>
                  {reactionStats.comments}
                </span>
                <span className={styles.reactionLabel}>Comments</span>
              </div>
              <div className={styles.reactionItem} onClick={handleRepostsClick} style={{ cursor: 'pointer' }}>
                <ArrowPathIcon className={styles.reactionIcon} />
                <span className={styles.reactionCount}>
                  {reactionStats.reposts}
                </span>
                <span className={styles.reactionLabel}>Reposts</span>
              </div>
            </div>
            
            {post.tags.length > 0 && (
              <div className={styles.tags}>
                {post.tags.map((tag: string) => (
                  <span key={tag} className={styles.tag}>#{tag}</span>
                ))}
              </div>
            )}
          </header>

          {post.summary && (
            <div className={styles.summary}>{post.summary}</div>
          )}

          <div className={styles.postContent} ref={postContentRef}>
            {isLoadingAdditionalData && processedContent === post.content && (
              <div className={styles.processingIndicator}>
                Processing content...
              </div>
            )}
            

            
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom text component to handle emojis in post content
                text: ({ children }) => {
                  try {
                    if (!post?.emojiTags || typeof children !== 'string') {
                      return <span>{children}</span>;
                    }
                    
                    // Create emoji map from stored emoji tags
                    const emojiMap = new Map<string, string>();
                    post.emojiTags.forEach(tag => {
                      emojiMap.set(tag.shortcode, tag.url);
                    });
                    
                    if (emojiMap.size === 0) {
                      return <span>{children}</span>;
                    }
                    
                    const renderedParts = renderCustomEmojis(children, emojiMap);
                    return <span>{renderedParts}</span>;
                  } catch (error) {
                    console.error('Error rendering emoji in text:', error);
                    return <span>{children}</span>;
                  }
                },
                img: ({ src, alt }: React.ComponentPropsWithoutRef<'img'>) => {
                  if (!src || typeof src !== 'string') return null;
                  
                  return (
                    <Image
                      src={src}
                      alt={alt || 'Image'}
                      width={800}
                      height={600}
                      style={{ width: '100%', height: 'auto' }}
                      className={styles.markdownImage}
                      onError={(e) => {
                        console.error('Image failed to load:', src);
                        // Just hide the failed image, don't manipulate DOM directly
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                      unoptimized
                    />
                  );
                },
                a: ({ ...props }) => {
                  const isNostrLink = props.href?.includes('njump.me');
                  const isVideoLink = props.href ? isVideoUrl(props.href) : false;
                  const isImageUrl = props.href?.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i);
                  
                                     // If this is an image URL, render it as an image instead of a link
                   if (isImageUrl && props.href) {
                     return (
                       <Image
                         src={props.href}
                         alt={props.children?.toString() || 'Image'}
                         width={800}
                         height={600}
                         style={{ width: '100%', height: 'auto' }}
                         className={styles.markdownImage}
                         onError={(e) => {
                           console.error('Image failed to load:', props.href);
                           // Just hide the failed image, don't manipulate DOM directly
                           const target = e.target as HTMLImageElement;
                           target.style.display = 'none';
                         }}
                         unoptimized
                       />
                     );
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
                              {props.children}
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
                    />
                  );
                },
                li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => {
                  // Check if this is a task list item (checkbox)
                  const child = children as React.ReactElement;
                  if (child && typeof child === 'object' && child.props && typeof child.props === 'object' && 'checked' in child.props) {
                    return (
                      <li {...props} className={styles.taskListItem}>
                        {children}
                      </li>
                    );
                  }
                  return <li {...props}>{children}</li>;
                },
                                 input: ({ checked, type, ...props }: React.ComponentPropsWithoutRef<'input'>) => {
                   if (type === 'checkbox') {
                     return (
                       <input
                         {...props}
                         type="checkbox"
                         checked={checked}
                         className={styles.taskCheckbox}
                         readOnly
                       />
                     );
                   }
                   return <input type={type} {...props} />;
                 },
              }}
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
              Comments ({reactionStats.comments})
            </h3>
            {isLoadingProfiles && (
              <div className={styles.profileLoadingIndicator}>
                <div className={styles.profileLoadingSpinner}></div>
                <span>Loading profiles...</span>
              </div>
            )}
          </div>
          
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
              <CommentThread comments={comments} />
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
                      <span className={styles.zapAuthorName}>
                        {zap.authorName || zap.pubkey.slice(0, 8) + '...'}
                      </span>
                      <span className={styles.zapAmount}>
                        ⚡ {zap.amount} sats
                      </span>
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
                                setSelectedCommentJson(JSON.stringify(fullEvent, null, 2));
                                setShowCommentJsonModal(true);
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
                              setSelectedCommentJson(JSON.stringify(fullEvent, null, 2));
                              setShowCommentJsonModal(true);
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

      {/* Comment JSON Modal */}
      {showCommentJsonModal && (
        <div className={styles.modalOverlay} onClick={closeCommentJson}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Event JSON</h2>
              <button 
                className={styles.modalCloseButton}
                onClick={closeCommentJson}
              >
                <XMarkIcon className={styles.modalCloseIcon} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <pre className={styles.jsonPre}>{selectedCommentJson}</pre>
            </div>
          </div>
        </div>
      )}

                           {/* Highlight Context Menu */}
       {showContextMenu && selectedText && (
         <div 
           className={styles.contextMenu}
           style={{
             left: `${contextMenuPosition.x}px`,
             top: `${contextMenuPosition.y}px`
           }}
         >
           {isAuthenticated ? (
             <button 
               className={styles.contextMenuButton}
               onClick={createHighlight}
               disabled={isCreatingHighlight}
             >
               <PencilIcon className={styles.contextMenuIcon} />
               {isCreatingHighlight ? 'Creating...' : 'Highlight'}
             </button>
           ) : (
             <div className={styles.contextMenuMessage}>
               Please log in to create highlights
             </div>
           )}
         </div>
       )}


    </div>
  );
} 