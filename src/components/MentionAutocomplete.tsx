'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { useBlog } from '@/contexts/BlogContext';
import { nip19 } from 'nostr-tools';
import './MentionAutocomplete.css';

interface MentionSuggestion {
  pubkey: string;
  npub: string;
  displayName?: string;
  name?: string;
  nip05?: string;
  image?: string;
  picture?: string;
}

interface MentionAutocompleteProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (suggestion: MentionSuggestion) => void;
  onClose: () => void;
}

export default function MentionAutocomplete({ 
  query, 
  position, 
  onSelect, 
  onClose 
}: MentionAutocompleteProps) {
  const { authorProfiles } = useBlog();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert pubkey to npub for display
  const pubkeyToNpub = (pubkey: string): string => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  };

  // Filter and sort suggestions based on query
  const suggestions = useMemo(() => {
    if (!query || query.length < 1) return [];

    const queryLower = query.toLowerCase();
    const allSuggestions: MentionSuggestion[] = [];

    // Convert authorProfiles to suggestions
    Object.entries(authorProfiles).forEach(([pubkey, profile]) => {
      const npub = pubkeyToNpub(pubkey);
      const displayName = profile.displayName || profile.name;
      const name = profile.name;
      const nip05 = profile.nip05;
      const image = profile.image;
      const picture = profile.picture;

      // Check if query matches any of the profile fields
      const matchesDisplayName = displayName?.toLowerCase().includes(queryLower);
      const matchesName = name?.toLowerCase().includes(queryLower);
      const matchesNip05 = nip05?.toLowerCase().includes(queryLower);
      const matchesNpub = npub.toLowerCase().includes(queryLower);

      if (matchesDisplayName || matchesName || matchesNip05 || matchesNpub) {
        allSuggestions.push({
          pubkey,
          npub,
          displayName,
          name,
          nip05,
          image,
          picture
        });
      }
    });

    // Sort suggestions by relevance
    return allSuggestions.sort((a, b) => {
      const aDisplayName = a.displayName || a.name || '';
      const bDisplayName = b.displayName || b.name || '';
      
      // Prioritize exact matches
      const aExactMatch = aDisplayName.toLowerCase().startsWith(queryLower);
      const bExactMatch = bDisplayName.toLowerCase().startsWith(queryLower);
      
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;
      
      // Then prioritize display name matches
      const aDisplayMatch = aDisplayName.toLowerCase().includes(queryLower);
      const bDisplayMatch = bDisplayName.toLowerCase().includes(queryLower);
      
      if (aDisplayMatch && !bDisplayMatch) return -1;
      if (!aDisplayMatch && bDisplayMatch) return 1;
      
      // Finally sort alphabetically
      return aDisplayName.localeCompare(bDisplayName);
    }).slice(0, 10); // Limit to 10 suggestions
  }, [query, authorProfiles]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, selectedIndex, onSelect, onClose]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Handle clicks outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (suggestions.length === 0) {
    return (
      <div 
        ref={containerRef}
        className="mention-autocomplete"
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          zIndex: 1000
        }}
      >
        <div className="mention-suggestions">
          <div className="mention-no-results">
            No profiles found for &quot;{query}&quot;
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="mention-autocomplete"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 1000
      }}
    >
      <div className="mention-suggestions">
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion.pubkey}
            className={`mention-suggestion ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="mention-avatar">
              {suggestion.image || suggestion.picture ? (
                <Image 
                  src={suggestion.image || suggestion.picture || ''} 
                  alt={suggestion.displayName || suggestion.name || 'Profile'} 
                  width={32}
                  height={32}
                  className="mention-avatar-image"
                />
              ) : (
                suggestion.displayName?.[0] || suggestion.name?.[0] || '?'
              )}
            </div>
            <div className="mention-info">
              <div className="mention-name">
                {suggestion.displayName || suggestion.name || 'Unknown'}
              </div>
              {suggestion.nip05 && (
                <div className="mention-nip05">
                  {suggestion.nip05}
                </div>
              )}
              <div className="mention-npub">
                {suggestion.npub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
