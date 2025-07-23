'use client';

import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { Draft } from '@/utils/storage';
import './Editor.css';

interface EditorProps {
  draft: Draft;
  onSave: (draft: Draft) => void;
  onContentChange?: (draft: Draft) => void;
}

export interface EditorRef {
  save: () => void;
  getContent: () => string;
  insertAtCursor: (text: string) => void;
}

const Editor = forwardRef<EditorRef, EditorProps>(({ draft, onSave, onContentChange }, ref) => {
  const [localDraft, setLocalDraft] = useState<Draft>(draft);
  const prevDraftContentRef = useRef<string>(draft.content);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleContentChange = (value?: string) => {
    if (!value) return;
    // Only update local state, don't call onSave
    const updatedDraft = {
      ...localDraft,
      content: value,
      lastModified: new Date().toISOString(),
    };
    setLocalDraft(updatedDraft);
    
    // Notify parent of content change for auto-save
    if (onContentChange) {
      onContentChange(updatedDraft);
    }
  };

  const handleSave = () => {
    // Only call onSave when explicitly requested
    onSave(localDraft);
  };

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
    </div>
  );
});

Editor.displayName = 'Editor';

export default Editor; 