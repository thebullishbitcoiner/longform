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
  console.log('🔍 highlightTextInElement called with:', {
    element: !!element,
    highlightsCount: highlights.length,
    highlightClass,
    highlights: highlights.map(h => ({ content: h.content, startOffset: h.startOffset, endOffset: h.endOffset }))
  });

  if (!element || highlights.length === 0) {
    console.log('🔍 No element or highlights, returning early');
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

  // Sort highlights by start offset to process them in order
  const sortedHighlights = highlights
    .filter(h => h.startOffset !== undefined && h.endOffset !== undefined)
    .sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));

  // Apply highlights using position-based approach
  sortedHighlights.forEach((highlight) => {
    console.log('🔍 Processing highlight:', {
      content: highlight.content,
      startOffset: highlight.startOffset,
      endOffset: highlight.endOffset
    });
    
    if (highlight.startOffset !== undefined && highlight.endOffset !== undefined) {
      console.log('🔍 Applying position-based highlight');
      applyPositionBasedHighlight(element, highlight.startOffset, highlight.endOffset, highlightClass);
    } else {
      // Fallback to text-based highlighting for highlights without position data
      console.log('🔍 Applying text-based highlight');
      const highlightText = highlight.content.trim();
      if (highlightText) {
        applySimpleHighlight(element, highlightText, highlightClass);
      }
    }
  });

  // Apply text-based highlighting for highlights without position data
  const textBasedHighlights = highlights.filter(h => h.startOffset === undefined || h.endOffset === undefined);
  textBasedHighlights.forEach((highlight) => {
    const highlightText = highlight.content.trim();
    if (highlightText) {
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

// Position-based highlighting function that handles multi-node highlights
function applyPositionBasedHighlight(
  element: HTMLElement,
  startOffset: number,
  endOffset: number,
  highlightClass: string
) {
  // Validate inputs
  if (startOffset < 0 || endOffset < 0 || startOffset >= endOffset) {
    console.warn('Invalid highlight offsets:', { startOffset, endOffset });
    return;
  }

  // Create a tree walker to traverse all text nodes
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  let currentNode: Text | null;
  let currentOffset = 0;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;

  // Find the text nodes that contain the start and end positions
  while (currentNode = walker.nextNode() as Text) {
    const nodeLength = currentNode.textContent?.length || 0;
    
    // Check if this node contains the start position
    if (!startNode && currentOffset + nodeLength > startOffset) {
      startNode = currentNode;
      startNodeOffset = Math.max(0, startOffset - currentOffset);
    }
    
    // Check if this node contains the end position
    if (!endNode && currentOffset + nodeLength >= endOffset) {
      endNode = currentNode;
      endNodeOffset = Math.min(nodeLength, endOffset - currentOffset);
      break; // We found both start and end, so we can stop
    }
    
    currentOffset += nodeLength;
  }

  // If we found both start and end nodes, apply the highlight
  if (startNode && endNode) {
    try {
      applyHighlightToRange(startNode, startNodeOffset, endNode, endNodeOffset, highlightClass);
    } catch (error) {
      console.error('Error applying highlight range:', error);
      // Fallback to simple text highlighting
      const highlightText = element.textContent?.substring(startOffset, endOffset);
      if (highlightText) {
        applySimpleHighlight(element, highlightText, highlightClass);
      }
    }
  } else {
    console.warn('Could not find text nodes for highlight range:', { startOffset, endOffset });
  }
}

// Apply highlight to a range spanning potentially multiple text nodes
function applyHighlightToRange(
  startNode: Text,
  startOffset: number,
  endNode: Text,
  endOffset: number,
  highlightClass: string
) {
  // Validate offsets
  const startNodeLength = startNode.textContent?.length || 0;
  const endNodeLength = endNode.textContent?.length || 0;
  
  if (startOffset > startNodeLength || endOffset > endNodeLength) {
    console.warn('Invalid node offsets:', { startOffset, startNodeLength, endOffset, endNodeLength });
    return;
  }

  // If start and end are in the same node
  if (startNode === endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    
    // Check if the range is valid
    if (range.collapsed) {
      console.warn('Range is collapsed, skipping highlight');
      return;
    }
    
    const span = document.createElement('span');
    span.className = highlightClass;
    
    try {
      range.surroundContents(span);
    } catch (error) {
      console.error('Error surrounding contents with span:', error);
      // Fallback: extract and reinsert
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }
    return;
  }

  // Handle multi-node highlighting
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  // Check if the range is valid
  if (range.collapsed) {
    console.warn('Range is collapsed, skipping highlight');
    return;
  }

  try {
    // Extract the content and create a highlighted span
    const fragment = range.extractContents();
    const span = document.createElement('span');
    span.className = highlightClass;
    span.appendChild(fragment);
    
    // Insert the highlighted content back
    range.insertNode(span);
  } catch (error) {
    console.error('Error applying multi-node highlight:', error);
    // If extraction fails, try a different approach
    try {
      const span = document.createElement('span');
      span.className = highlightClass;
      range.surroundContents(span);
    } catch (surroundError) {
      console.error('Error with surroundContents fallback:', surroundError);
    }
  }
}
