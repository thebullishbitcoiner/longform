'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, CheckIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { getDraft, updateDraft, Draft } from '@/utils/storage';
import { use } from 'react';
import Editor from '@/components/Editor';
import './page.css';

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const router = useRouter();
  const { id } = use(params);

  useEffect(() => {
    const savedDraft = getDraft(id);
    if (!savedDraft) {
      router.push('/');
      return;
    }
    setDraft(savedDraft);
  }, [id, router]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!draft) return;
    const updatedDraft = {
      ...draft,
      title: e.target.value,
      lastModified: new Date().toISOString(),
    };
    setDraft(updatedDraft);
    updateDraft(updatedDraft);
  };

  const handleSave = (updatedDraft: Draft) => {
    setDraft(updatedDraft);
    updateDraft(updatedDraft);
  };

  const handleCopy = () => {
    if (!draft) return;
    const content = `${draft.title}\n\n${draft.content}`;
    navigator.clipboard.writeText(content);
  };

  if (!draft) return null;

  return (
    <main className="container">
      <div className="editor-header">
        <button onClick={() => router.push('/')} className="back-button">
          <ArrowLeftIcon />
          Back to Drafts
        </button>
        <input
          type="text"
          value={draft.title}
          onChange={handleTitleChange}
          className="title-input"
          placeholder="Untitled Draft"
        />
      </div>
      <Editor draft={draft} onSave={handleSave} />
      <div className="editor-footer">
        <div className="editor-actions">
          <button 
            onClick={() => handleSave(draft)} 
            className="action-button save-button"
            title="Save Draft"
          >
            <CheckIcon />
            Save
          </button>
          <button 
            onClick={handleCopy} 
            className="action-button copy-button"
            title="Copy to Clipboard"
          >
            <ClipboardIcon />
            Copy
          </button>
        </div>
      </div>
    </main>
  );
} 