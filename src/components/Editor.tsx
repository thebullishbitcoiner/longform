'use client';

import { useState, useEffect, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { Draft } from '@/utils/storage';
import MentionAutocomplete from './MentionAutocomplete';
import './Editor.css';

interface EditorProps {
  draft: Draft;
  onSave: (draft: Draft) => void;
  onContentChange?: (draft: Draft) => void;
}

/**
 * Editor component with mention functionality
 * 
 * Features:
 * - Markdown editing with live preview
 * - @ mention autocomplete based on cached author profiles
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Automatic npub insertion when selecting mentions
 */

export interface EditorRef {
  save: () => void;
  getContent: () => string;
  insertAtCursor: (text: string) => void;
}

interface MentionState {
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
  startIndex: number;
  endIndex: number;
}

const Editor = forwardRef<EditorRef, EditorProps>(({ draft, onSave, onContentChange }, ref) => {
  const [localDraft, setLocalDraft] = useState<Draft>(draft);
  const prevDraftContentRef = useRef<string>(draft.content);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mentionState, setMentionState] = useState<MentionState>({
    isOpen: false,
    query: '',
    position: { top: 0, left: 0 },
    startIndex: 0,
    endIndex: 0
  });

  // Update local draft when prop changes, but only if content actually changed
  useEffect(() => {
    // Only update if the content has actually changed from the prop
    // This prevents clearing the editor when other properties like hashtags are updated
    if (draft.content !== prevDraftContentRef.current) {
      setLocalDraft(draft);
      prevDraftContentRef.current = draft.content;
    } else {
      // Update other properties without affecting content
      setLocalDraft(prev => ({
        ...draft,
        content: prev.content // Preserve the current editor content
      }));
    }
  }, [draft]);

  // Detect mention trigger and update mention state
  const detectMention = useCallback((content: string, cursorPosition: number) => {
    // Look for @ symbol before cursor, but not if it's part of an email or already a complete mention
    const beforeCursor = content.substring(0, cursorPosition);
    
    // Check if we're in the middle of an email address
    const emailMatch = beforeCursor.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
    if (emailMatch) {
      setMentionState(prev => ({ ...prev, isOpen: false }));
      return;
    }
    
    // Look for @ symbol followed by word characters or nothing
    // Also check that we're not in the middle of a word
    const mentionMatch = beforeCursor.match(/@([a-zA-Z0-9_]*)$/);
    
    // If there's a space or other non-word character right before the @, close the mention
    if (mentionMatch && mentionMatch.index! > 0) {
      const charBeforeAt = beforeCursor[mentionMatch.index! - 1];
      if (charBeforeAt && /\S/.test(charBeforeAt) && !/[a-zA-Z0-9_]/.test(charBeforeAt)) {
        setMentionState(prev => ({ ...prev, isOpen: false }));
        return;
      }
    }
    
    if (mentionMatch) {
      const startIndex = cursorPosition - mentionMatch[0].length;
      const query = mentionMatch[1];
      
      // Get cursor position for autocomplete placement
      const textarea = containerRef.current?.querySelector('textarea');
      if (textarea) {
        const rect = textarea.getBoundingClientRect();
        const lineHeight = 20; // Approximate line height
        const lines = beforeCursor.split('\n');
        const currentLine = lines.length - 1;
        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
        const charInLine = cursorPosition - lineStart;
        
        // Approximate character width (this is a rough estimate)
        const charWidth = 8;
        const left = rect.left + (charInLine * charWidth);
        const top = rect.top + (currentLine * lineHeight) + lineHeight;
        
        setMentionState({
          isOpen: true,
          query,
          position: { top, left },
          startIndex,
          endIndex: cursorPosition
        });
      }
    } else {
      setMentionState(prev => ({ ...prev, isOpen: false }));
    }
  }, []);

  const handleContentChange = (value?: string) => {
    if (!value) return;
    
    // Only update local state, don't call onSave
    const updatedDraft = {
      ...localDraft,
      content: value,
      lastModified: new Date().toISOString(),
    };
    setLocalDraft(updatedDraft);
    
    // Detect mentions
    const textarea = containerRef.current?.querySelector('textarea');
    if (textarea) {
      const cursorPosition = textarea.selectionStart;
      detectMention(value, cursorPosition);
    }
    
    // Notify parent of content change for auto-save
    if (onContentChange) {
      onContentChange(updatedDraft);
    }
  };

  const handleSave = () => {
    // Only call onSave when explicitly requested
    onSave(localDraft);
  };

  const handleMentionSelect = useCallback((suggestion: { npub: string; displayName?: string; name?: string }) => {
    const { startIndex, endIndex } = mentionState;
    const currentContent = localDraft.content;
    
    // Replace the @query with @npub
    const newContent = 
      currentContent.substring(0, startIndex) + 
      `@${suggestion.npub}` + 
      currentContent.substring(endIndex);
    
    // Update the draft with new content
    const updatedDraft = {
      ...localDraft,
      content: newContent,
      lastModified: new Date().toISOString(),
    };
    setLocalDraft(updatedDraft);
    
    // Close mention autocomplete
    setMentionState(prev => ({ ...prev, isOpen: false }));
    
    // Notify parent of content change for auto-save
    if (onContentChange) {
      onContentChange(updatedDraft);
    }
    
    // Set cursor position after inserted mention
    setTimeout(() => {
      const textarea = containerRef.current?.querySelector('textarea');
      if (textarea) {
        const newCursorPosition = startIndex + suggestion.npub.length + 1; // +1 for @
        textarea.focus();
        textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }, 0);
  }, [mentionState, localDraft, onContentChange]);

  const handleMentionClose = useCallback(() => {
    setMentionState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const insertAtCursor = (text: string) => {
    if (containerRef.current) {
      const textarea = containerRef.current.querySelector('textarea');
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentContent = localDraft.content;
        
        // Insert text at cursor position
        const newContent = currentContent.substring(0, start) + text + currentContent.substring(end);
        
        // Update the draft with new content
        const updatedDraft = {
          ...localDraft,
          content: newContent,
          lastModified: new Date().toISOString(),
        };
        setLocalDraft(updatedDraft);
        
        // Notify parent of content change for auto-save
        if (onContentChange) {
          onContentChange(updatedDraft);
        }
        
        // Set cursor position after inserted text
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + text.length, start + text.length);
        }, 0);
      }
    }
  };

  // Expose functions to parent
  useImperativeHandle(ref, () => ({
    save: handleSave,
    getContent: () => localDraft.content,
    insertAtCursor
  }));

  // Add cursor position detection for better mention positioning
  useEffect(() => {
    const handleCursorMove = () => {
      if (mentionState.isOpen) {
        const textarea = containerRef.current?.querySelector('textarea');
        if (textarea) {
          const cursorPosition = textarea.selectionStart;
          detectMention(localDraft.content, cursorPosition);
        }
      }
    };

    const textarea = containerRef.current?.querySelector('textarea');
    if (textarea) {
      textarea.addEventListener('keyup', handleCursorMove);
      textarea.addEventListener('click', handleCursorMove);
      return () => {
        textarea.removeEventListener('keyup', handleCursorMove);
        textarea.removeEventListener('click', handleCursorMove);
      };
    }
  }, [mentionState.isOpen, localDraft.content, detectMention]);

  return (
    <div className="editor-container" ref={containerRef}>
      <MDEditor
        ref={editorRef}
        value={localDraft.content}
        onChange={handleContentChange}
        preview="edit"
        height="calc(100vh - 12rem)"
        className="markdown-editor"
      />
      {mentionState.isOpen && (
        <MentionAutocomplete
          query={mentionState.query}
          position={mentionState.position}
          onSelect={handleMentionSelect}
          onClose={handleMentionClose}
        />
      )}
    </div>
  );
});

Editor.displayName = 'Editor';

export default Editor; 