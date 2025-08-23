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
  startOffset?: number;
  endOffset?: number;
  eventTags: string[][];
}

export function useHighlights() {
  const { ndk, isAuthenticated, currentUser } = useNostr();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  // Convert NDK event to Highlight interface
  const eventToHighlight = useCallback((event: NDKEvent): Highlight => {
    return {
      id: event.id,
      content: event.content,
      created_at: event.created_at * 1000, // Convert to milliseconds
      postId: event.tags.find(tag => tag[0] === 'e')?.[1] || '',
      postAuthor: event.tags.find(tag => tag[0] === 'p')?.[1] || '',
      startOffset: event.tags.find(tag => tag[0] === 'start')?.[1] ? 
        parseInt(event.tags.find(tag => tag[0] === 'start')?.[1] || '0') : undefined,
      endOffset: event.tags.find(tag => tag[0] === 'end')?.[1] ? 
        parseInt(event.tags.find(tag => tag[0] === 'end')?.[1] || '0') : undefined,
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
  const getHighlightsForPost = useCallback((postId: string): Highlight[] => {
    return highlights.filter(h => h.postId === postId);
  }, [highlights]);

  // Refresh highlights
  const refreshHighlights = useCallback(() => {
    fetchHighlights(true);
  }, [fetchHighlights]);

  // Load highlights on mount and when user changes
  useEffect(() => {
    if (isAuthenticated && currentUser?.pubkey) {
      fetchHighlights();
    } else {
      setHighlights([]);
      setLastFetched(null);
    }
  }, [isAuthenticated, currentUser?.pubkey, fetchHighlights]);

  return {
    highlights,
    isLoading,
    lastFetched,
    fetchHighlights,
    addHighlight,
    getHighlightsForPost,
    refreshHighlights
  };
}

// Utility function to highlight text in DOM
export function highlightTextInElement(
  element: HTMLElement, 
  highlights: Highlight[], 
  highlightClass = 'userHighlight'
) {
  if (!element || highlights.length === 0) {
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

  // Apply new highlights using a safer approach
  highlights.forEach((highlight) => {
    const highlightText = highlight.content.trim();
    if (!highlightText) {
      return;
    }

    // Use a simple text replacement approach that's more reliable
    applySimpleHighlight(element, highlightText, highlightClass);
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
  
  // Escape the highlight text for regex
  const escapedText = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedText})`, 'gi');
  
  // Replace the text with highlighted version
  const highlightedHTML = originalHTML.replace(regex, `<span class="${highlightClass}">$1</span>`);
  
  // Only update if there were changes
  if (highlightedHTML !== originalHTML) {
    element.innerHTML = highlightedHTML;
  }
}
