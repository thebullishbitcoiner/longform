import { useState, useEffect, useCallback } from 'react';
import { useNostr } from '@/contexts/NostrContext';
import { 
  cacheUserHighlights, 
  getCachedHighlights, 
  addHighlightToCache
} from './storage';
import { NDKEvent } from '@nostr-dev-kit/ndk';

export interface Highlight {
  id: string;
  content: string;
  created_at: number;
  postId: string;
  postAuthor: string;
  postDTag?: string;
  eventTags: string[][];
}

export function useHighlights(options?: { autoFetch?: boolean }) {
  const { ndk, isAuthenticated, currentUser } = useNostr();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const autoFetch = options?.autoFetch !== false; // Default to true for backward compatibility

  // Convert NDK event to Highlight interface
  const eventToHighlight = useCallback((event: NDKEvent): Highlight => {
    // Parse the "a" tag to get author pubkey and d tag
    const aTag = event.tags.find(tag => tag[0] === 'a')?.[1];
    let postAuthor = '';
    let postDTag = '';
    
    if (aTag) {
      // Parse "a" tag format: "kind:author_pubkey:d_tag"
      const aTagParts = aTag.split(':');
      if (aTagParts.length >= 3) {
        postAuthor = aTagParts[1]; // author pubkey
        postDTag = aTagParts[2];   // d tag
      }
    }
    
    // Fallback to "p" tag if "a" tag parsing fails
    if (!postAuthor) {
      postAuthor = event.tags.find(tag => tag[0] === 'p')?.[1] || '';
    }
    
    return {
      id: event.id,
      content: event.content,
      created_at: event.created_at * 1000, // Convert to milliseconds
      postId: event.tags.find(tag => tag[0] === 'e')?.[1] || '', // Keep e tag for backward compatibility
      postAuthor,
      postDTag,
      eventTags: event.tags
    };
  }, []);

  // Fetch highlights from Nostr
  const fetchHighlights = useCallback(async (forceRefresh = false) => {
    if (!isAuthenticated || !currentUser?.pubkey || !ndk) {
      return;
    }

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getCachedHighlights(currentUser.pubkey);
      if (cached) {
        setHighlights(cached);
        setLastFetched(Date.now());
        return;
      }
    }

    setIsLoading(true);

    try {
      console.log('🔍 Fetching highlights for user:', currentUser.pubkey);
      
      // Fetch user's highlights (kind 9802)
      const highlightsQuery = await ndk.fetchEvents({
        kinds: [9802],
        authors: [currentUser.pubkey],
        limit: 500, // Increased limit to get more highlights
      });

      const highlightsArray = Array.from(highlightsQuery);
      console.log(`🔍 Found ${highlightsArray.length} highlights`);

      // Convert events to highlights
      const userHighlights: Highlight[] = highlightsArray
        .map(eventToHighlight)
        .sort((a, b) => b.created_at - a.created_at); // Sort by newest first

      // Cache the highlights
      cacheUserHighlights(currentUser.pubkey, userHighlights);
      
      setHighlights(userHighlights);
      setLastFetched(Date.now());
      
      console.log('🔍 Highlights cached and updated');
    } catch (error) {
      console.error('Error fetching highlights:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, currentUser?.pubkey, ndk, eventToHighlight]);

  // Add a new highlight
  const addHighlight = useCallback((highlight: Highlight) => {
    if (!currentUser?.pubkey) return;

    // Add to cache
    addHighlightToCache(currentUser.pubkey, highlight);
    
    // Update local state
    setHighlights(prev => [highlight, ...prev]);
  }, [currentUser?.pubkey]);

  // Get highlights for a specific post
  const getHighlightsForPost = useCallback((postId: string, postAuthor?: string, postDTag?: string): Highlight[] => {
    // Debug: Only log if there are highlights to search through
    if (highlights.length > 0) {
      console.log('🔍 Searching highlights for post:', postId, '(', highlights.length, 'total highlights)');
    }
    
    const matches = highlights.filter(h => {
      // First try to match by postId (e tag) for backward compatibility
      if (h.postId === postId) {
        console.log('🔍 Matched by e tag:', h.id);
        return true;
      }
      
      // If we have author and d tag info, try to match using a tag data
      if (postAuthor && postDTag) {
        // Check if this highlight has a tag data that matches
        const aTag = h.eventTags.find(tag => tag[0] === 'a')?.[1];
        if (aTag) {
          const aTagParts = aTag.split(':');
          if (aTagParts.length >= 3) {
            const highlightAuthor = aTagParts[1];
            const highlightDTag = aTagParts[2];
            if (highlightAuthor === postAuthor && highlightDTag === postDTag) {
              console.log('🔍 Matched by a tag:', h.id);
              return true;
            }
          }
        }
      }
      
      return false;
    });
    
    console.log('🔍 getHighlightsForPost result:', matches.length, 'matches');
    return matches;
  }, [highlights]);

  // Delete a highlight
  const deleteHighlight = useCallback(async (highlightId: string) => {
    if (!isAuthenticated || !currentUser?.pubkey || !ndk) {
      console.error('Cannot delete highlight: not authenticated or no NDK');
      return false;
    }

    try {
      console.log('🗑️ Deleting highlight:', highlightId);
      
      // Create a deletion event (kind 5)
      const deleteEvent = new NDKEvent(ndk);
      deleteEvent.kind = 5; // Deletion event
      deleteEvent.content = 'Deleted highlight'; // Optional reason
      deleteEvent.tags = [
        ['e', highlightId] // Reference to the highlight being deleted
      ];
      deleteEvent.created_at = Math.floor(Date.now() / 1000);

      // Publish the deletion event
      await deleteEvent.publish();
      
      // Remove from local state
      setHighlights(prev => prev.filter(h => h.id !== highlightId));
      
      // Remove from cache
      const cachedHighlights = getCachedHighlights(currentUser.pubkey) || [];
      const updatedCachedHighlights = cachedHighlights.filter(h => h.id !== highlightId);
      cacheUserHighlights(currentUser.pubkey, updatedCachedHighlights);
      
      console.log('🗑️ Highlight deleted successfully:', highlightId);
      return true;
    } catch (error) {
      console.error('Error deleting highlight:', error);
      return false;
    }
  }, [isAuthenticated, currentUser?.pubkey, ndk]);

  // Refresh highlights
  const refreshHighlights = useCallback(() => {
    fetchHighlights(true);
  }, [fetchHighlights]);

  // Load highlights on mount and when user changes (only if autoFetch is enabled)
  useEffect(() => {
    if (!autoFetch) {
      return; // Skip auto-fetching if disabled
    }
    
    console.log('🔍 useHighlights useEffect triggered:', {
      isAuthenticated,
      currentUserPubkey: currentUser?.pubkey,
      highlightsCount: highlights.length
    });
    
    if (isAuthenticated && currentUser?.pubkey) {
      console.log('🔍 Fetching highlights for user:', currentUser.pubkey);
      fetchHighlights();
    } else {
      console.log('🔍 Clearing highlights - not authenticated or no user');
      setHighlights([]);
      setLastFetched(null);
    }
  }, [isAuthenticated, currentUser?.pubkey, fetchHighlights, autoFetch]);

  return {
    highlights,
    isLoading,
    lastFetched,
    fetchHighlights,
    addHighlight,
    getHighlightsForPost,
    refreshHighlights,
    deleteHighlight
  };
}

// Utility function to highlight text in DOM
export function highlightTextInElement(
  element: HTMLElement, 
  highlights: Highlight[], 
  highlightClass = 'userHighlight'
) {
  // Debug: Only log if there are highlights to apply
  if (highlights.length > 0) {
    console.log('🔍 Applying highlights:', highlights.length, 'highlights to', element?.tagName);
  }

  if (!element || highlights.length === 0) {
    console.log('🔍 No element or highlights, returning early');
    return;
  }

  // Check if element is still in the DOM
  if (!element.parentNode && element !== document.body) {
    console.log('🔍 Element is no longer in the DOM, skipping highlights');
    return;
  }

  // Check if element has content
  if (!element.textContent || element.textContent.trim().length === 0) {
    console.log('🔍 Element has no text content, skipping highlights');
    return;
  }

  // Remove existing highlights
  const existingHighlights = element.querySelectorAll(`.${highlightClass}`);
  existingHighlights.forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      parent.normalize(); // Merge adjacent text nodes
    }
  });

  // Apply text-based highlighting for all highlights
  highlights.forEach((highlight) => {
    const highlightText = highlight.content.trim();
    if (highlightText) {
      // Debug: Only log if highlight is substantial
      if (highlight.content.length > 10) {
        console.log('🔍 Applying highlight:', highlight.content.substring(0, 30) + '...');
      }
      applySimpleHighlight(element, highlightText, highlightClass);
    }
  });
}

// Simple and safe highlighting function
function applySimpleHighlight(
  element: HTMLElement,
  highlightText: string,
  highlightClass: string
) {
  // Use a more robust approach: work with the element's HTML content
  const originalHTML = element.innerHTML;
  
  // Normalize the highlight text to match the same normalization used when creating highlights
  const normalizedHighlightText = highlightText
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[""]/g, '"') // Normalize smart quotes to regular quotes
    .replace(/['']/g, "'") // Normalize smart apostrophes to regular apostrophes
    .trim();
  
  // Escape the normalized highlight text for regex
  const escapedText = normalizedHighlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedText})`, 'gi');
  
  // Replace the text with highlighted version
  const highlightedHTML = originalHTML.replace(regex, `<span class="${highlightClass}">$1</span>`);
  
  // Only update if there were changes
  if (highlightedHTML !== originalHTML) {
    element.innerHTML = highlightedHTML;
  }
}

