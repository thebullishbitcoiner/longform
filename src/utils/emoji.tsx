import React from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';

export interface CustomEmoji {
  shortcode: string;
  url: string;
}

/**
 * Extract custom emoji definitions from a Nostr event's tags
 * @param event - The NDKEvent containing emoji tags
 * @returns Map of shortcode to emoji URL
 */
export function extractCustomEmojis(event: NDKEvent): Map<string, string> {
  const emojiMap = new Map<string, string>();
  
  if (!event.tags) return emojiMap;
  
  for (const tag of event.tags) {
    if (tag[0] === 'emoji' && tag[1] && tag[2]) {
      const shortcode = tag[1] as string;
      const url = tag[2] as string;
      emojiMap.set(shortcode, url);
    }
  }
  
  return emojiMap;
}

/**
 * Render content with custom emojis replaced by images
 * @param content - The text content containing emoji shortcodes
 * @param emojiMap - Map of shortcode to emoji URL
 * @returns JSX elements with custom emojis rendered as images
 */
export function renderCustomEmojis(content: string, emojiMap: Map<string, string>): (string | React.ReactElement)[] {
  if (!content || emojiMap.size === 0) {
    return [content];
  }

  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  
  // Regex to match emoji shortcodes like :shortcode:
  const emojiRegex = /:([a-zA-Z0-9_]+):/g;
  let match;
  
  while ((match = emojiRegex.exec(content)) !== null) {
    const shortcode = match[1];
    const emojiUrl = emojiMap.get(shortcode);
    
    // Add text before the emoji
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    
    if (emojiUrl) {
             // Render as image
       parts.push(
         <img
           key={`emoji-${shortcode}-${match.index}`}
           src={emojiUrl}
           alt={`:${shortcode}:`}
           className="inline-block align-text-bottom"
           style={{ 
             verticalAlign: 'text-bottom',
             maxWidth: '1.25rem',
             maxHeight: '1.25rem',
             width: '1.25rem',
             height: '1.25rem',
             objectFit: 'contain'
           }}
           onError={(e) => {
             // Fallback to text if image fails to load
             const target = e.target as HTMLImageElement;
             target.style.display = 'none';
             const textNode = document.createTextNode(`:${shortcode}:`);
             target.parentNode?.appendChild(textNode);
           }}
         />
       );
    } else {
      // Keep original text if emoji not found
      parts.push(match[0]);
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  
  return parts;
}

/**
 * Render content with custom emojis as a simple string (for non-JSX contexts)
 * @param content - The text content containing emoji shortcodes
 * @param emojiMap - Map of shortcode to emoji URL
 * @returns String with emoji shortcodes replaced by fallback text
 */
export function renderCustomEmojisAsText(content: string, emojiMap: Map<string, string>): string {
  if (!content || emojiMap.size === 0) {
    return content;
  }

  return content.replace(/:([a-zA-Z0-9_]+):/g, (match, shortcode) => {
    return emojiMap.has(shortcode) ? `[${shortcode}]` : match;
  });
}

/**
 * Check if content contains any custom emoji shortcodes
 * @param content - The text content to check
 * @returns True if content contains emoji shortcodes
 */
export function hasCustomEmojis(content: string): boolean {
  return /:([a-zA-Z0-9_]+):/.test(content);
}

/**
 * Get all emoji shortcodes from content
 * @param content - The text content to parse
 * @returns Array of emoji shortcodes found in content
 */
export function extractEmojiShortcodes(content: string): string[] {
  const shortcodes: string[] = [];
  const emojiRegex = /:([a-zA-Z0-9_]+):/g;
  let match;
  
  while ((match = emojiRegex.exec(content)) !== null) {
    shortcodes.push(match[1]);
  }
  
  return [...new Set(shortcodes)]; // Remove duplicates
}
