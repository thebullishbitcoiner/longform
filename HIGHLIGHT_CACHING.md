# Highlight Caching System

This document explains how the highlight caching system works in the Longform application.

## Overview

The highlight caching system automatically caches user highlights (kind 9802 events) in localStorage and applies them to articles when they are loaded. This provides a seamless experience where users can see their existing highlights immediately without waiting for network requests.

## Architecture

### 1. Storage Layer (`src/utils/storage.ts`)

- **`cacheUserHighlights(pubkey, highlights)`**: Stores user highlights in localStorage with timestamp
- **`getCachedHighlights(pubkey)`**: Retrieves cached highlights for a user (with 1-hour expiry)
- **`addHighlightToCache(pubkey, highlight)`**: Adds a single highlight to the cache
- **`getHighlightsForPost(pubkey, postId)`**: Gets highlights for a specific post

### 2. Hook Layer (`src/utils/highlights.ts`)

- **`useHighlights()`**: React hook that manages highlight state and operations
- **`highlightTextInElement(element, highlights, className)`**: Utility function that applies highlights to DOM elements

### 3. Integration Points

- **Reader Page**: Automatically applies highlights when articles load
- **Profile Page**: Displays user highlights (existing functionality)
- **NostrContext**: Triggers highlight refresh on authentication

## How It Works

### 1. Authentication Flow

When a user authenticates:
1. The `useHighlights` hook automatically fetches highlights from Nostr
2. Highlights are cached in localStorage with a timestamp
3. Cache expires after 1 hour to ensure freshness

### 2. Article Loading Flow

When an article loads:
1. The reader page uses `getHighlightsForPost()` to get highlights for the current post
2. After content renders, `highlightTextInElement()` applies highlights to the DOM
3. Highlights appear as purple text with hover effects

### 3. Creating New Highlights

When a user creates a highlight:
1. The highlight is published to Nostr (existing functionality)
2. The highlight is immediately added to the local cache
3. The article content is re-highlighted to show the new highlight

## Highlight Format

Highlights are stored as kind 9802 events with the following structure:

```typescript
interface Highlight {
  id: string;
  content: string;
  created_at: number;
  postId: string;
  postAuthor: string;
  startOffset?: number;
  endOffset?: number;
  eventTags: string[][];
}
```

## CSS Styling

Highlights use the `.userHighlight` CSS class with:
- Light purple background (`#e6e6fa`)
- Rounded corners
- Hover effects
- Proper text wrapping

## Example Event

```json
{
  "id": "13da98cea47a24443ee02534fa080ce814ee88094c23b51f3fea2a5ab2c522df",
  "pubkey": "a10260a2aa2f092d85e2c0b82e95eac5f8c60ea19c68e4898719b58ccaa23e3e",
  "created_at": 1755618731,
  "kind": 9802,
  "tags": [
    ["e", "f127cc4b33064b140a30ea45de618fcb8065c8a06b255d1fe7bba669af772060"],
    ["p", "04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9"],
    ["client", "Longform._"],
    ["start", "0"],
    ["end", "264"]
  ],
  "content": "There is something quietly rebellious about stacking sats...",
  "sig": ""
}
```

## Benefits

1. **Performance**: Highlights load instantly from cache
2. **Offline Support**: Highlights work without network connection
3. **User Experience**: No waiting for highlights to load
4. **Consistency**: Highlights appear immediately across all articles
5. **Efficiency**: Reduces network requests and relay load

## Debug Component

For development, a `HighlightDebug` component shows:
- Number of cached highlights
- Last fetch timestamp
- Sample highlight content
- Manual refresh button

Remove this component in production.

## Future Enhancements

1. **Background Sync**: Periodically refresh highlights in background
2. **Conflict Resolution**: Handle highlight updates and deletions
3. **Cross-Device Sync**: Sync highlights across devices
4. **Highlight Analytics**: Track highlight usage and patterns
5. **Advanced Styling**: Different highlight colors for different purposes
