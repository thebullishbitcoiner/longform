'use client';

import MDEditor from '@uiw/react-md-editor';
import { Draft } from '@/utils/storage';
import './Editor.css';

interface EditorProps {
  draft: Draft;
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

export default function Editor({ draft, onSave, onClose }: EditorProps) {
  const handleContentChange = (value?: string) => {
    if (!value) return;
    onSave({
      ...draft,
      content: value,
      lastModified: new Date().toISOString(),
    });
  };

  return (
    <div className="editor-container">
      <MDEditor
        value={draft.content}
        onChange={handleContentChange}
        preview="edit"
        height="calc(100vh - 12rem)"
        className="markdown-editor"
      />
    </div>
  );
} 