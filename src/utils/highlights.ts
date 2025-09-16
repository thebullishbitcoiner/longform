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
  contextText?: string; // Primal-style highlighting
  startOffset?: number; // Longform-style highlighting
  endOffset?: number;   // Longform-style highlighting
  eventTags: string[][];
}

export function useHighlights() {
  const { ndk, isAuthenticated, currentUser } = useNostr();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

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
    
    // Check for context tag (Primal-style highlighting)
    const contextTag = event.tags.find(tag => tag[0] === 'context')?.[1];
    
    // Get start/end offsets (Longform-style highlighting)
    const startTag = event.tags.find(tag => tag[0] === 'start')?.[1];
    const endTag = event.tags.find(tag => tag[0] === 'end')?.[1];

    
    return {
      id: event.id,
      content: event.content,
      created_at: event.created_at * 1000, // Convert to milliseconds
      postId: event.tags.find(tag => tag[0] === 'e')?.[1] || '', // Keep e tag for backward compatibility
      postAuthor,
      postDTag,
      // Use context tag if available (Primal-style), otherwise use start/end offsets (Longform-style)
      contextText: contextTag,
      startOffset: startTag ? parseInt(startTag) : undefined,
      endOffset: endTag ? parseInt(endTag) : undefined,
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
    console.log('🔍 getHighlightsForPost called with:', {
      postId,
      postAuthor,
      postDTag,
      totalHighlights: highlights.length,
      highlights: highlights.map(h => ({
        id: h.id,
        postId: h.postId,
        postAuthor: h.postAuthor,
        aTag: h.eventTags.find(tag => tag[0] === 'a')?.[1]
      }))
    });
    
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

  // Refresh highlights
  const refreshHighlights = useCallback(() => {
    fetchHighlights(true);
  }, [fetchHighlights]);

  // Load highlights on mount and when user changes
  useEffect(() => {
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
    elementTagName: element?.tagName,
    elementTextLength: element?.textContent?.length,
    highlightsCount: highlights.length,
    highlightClass,
    highlights: highlights.map(h => ({ 
      id: h.id,
      content: h.content.substring(0, 50) + '...', 
      startOffset: h.startOffset, 
      endOffset: h.endOffset 
    }))
  });

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

  // Sort highlights by start offset to process them in order
  const sortedHighlights = highlights
    .filter(h => h.startOffset !== undefined && h.endOffset !== undefined)
    .sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));

  // Apply highlights using position-based approach
  sortedHighlights.forEach((highlight, index) => {
    console.log(`🔍 Processing highlight ${index + 1}/${sortedHighlights.length}:`, {
      id: highlight.id,
      content: highlight.content.substring(0, 50) + '...',
      startOffset: highlight.startOffset,
      endOffset: highlight.endOffset,
      elementTextLength: element.textContent?.length
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
  // Validate inputs and check if nodes are still in the DOM
  if (!startNode.parentNode || !endNode.parentNode) {
    console.warn('Nodes are no longer in the DOM, skipping highlight');
    return;
  }

  const startNodeLength = startNode.textContent?.length || 0;
  const endNodeLength = endNode.textContent?.length || 0;
  
  if (startOffset > startNodeLength || endOffset > endNodeLength) {
    console.warn('Invalid node offsets:', { startOffset, startNodeLength, endOffset, endNodeLength });
    return;
  }

  // If start and end are in the same node
  if (startNode === endNode) {
    try {
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
      
      range.surroundContents(span);
    } catch (error) {
      console.error('Error surrounding contents with span:', error);
      // Fallback to simple text highlighting
      const highlightText = startNode.textContent?.substring(startOffset, endOffset);
      if (highlightText) {
        const parent = startNode.parentNode;
        if (parent) {
          const span = document.createElement('span');
          span.className = highlightClass;
          span.textContent = highlightText;
          parent.replaceChild(span, startNode);
        }
      }
    }
    return;
  }

  // Handle multi-node highlighting
  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    // Check if the range is valid
    if (range.collapsed) {
      console.warn('Range is collapsed, skipping highlight');
      return;
    }

    // Extract the content and create a highlighted span
    const fragment = range.extractContents();
    const span = document.createElement('span');
    span.className = highlightClass;
    span.appendChild(fragment);
    
    // Insert the highlighted content back
    range.insertNode(span);
  } catch (error) {
    console.error('Error applying multi-node highlight:', error);
    // If all else fails, try simple text highlighting
    const highlightText = startNode.textContent?.substring(startOffset, endOffset);
    if (highlightText) {
      const parent = startNode.parentNode;
      if (parent) {
        const span = document.createElement('span');
        span.className = highlightClass;
        span.textContent = highlightText;
        parent.replaceChild(span, startNode);
      }
    }
  }
}
