'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { Draft } from '@/utils/storage';
import './Editor.css';

interface EditorProps {
  draft: Draft;
  onSave: (draft: Draft) => void;
}

export interface EditorRef {
  save: () => void;
  getContent: () => string;
}

const Editor = forwardRef<EditorRef, EditorProps>(({ draft, onSave }, ref) => {
  const [localDraft, setLocalDraft] = useState<Draft>(draft);

  // Update local draft when prop changes
  useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);

  const handleContentChange = (value?: string) => {
    if (!value) return;
    // Only update local state, don't call onSave
    setLocalDraft(prev => ({
      ...prev,
      content: value,
      lastModified: new Date().toISOString(),
    }));
  };

  const handleSave = () => {
    // Only call onSave when explicitly requested
    onSave(localDraft);
  };

  // Expose save function to parent
  useImperativeHandle(ref, () => ({
    save: handleSave,
    getContent: () => localDraft.content
  }));

  return (
    <div className="editor-container">
      <MDEditor
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