'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline';
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

  if (!draft) return null;

  return (
    <main className="container">
      <div className="editor-header">
        <button onClick={() => router.push('/')} className="back-button">
          <ArrowLeftIcon />
          Back to Drafts
        </button>
        <div className="title-row">
          <input
            type="text"
            value={draft.title}
            onChange={handleTitleChange}
            className="title-input"
            placeholder="Untitled Draft"
          />
          <button 
            onClick={() => handleSave(draft)} 
            className="save-button"
            title="Save Draft"
          >
            <CheckIcon />
            Save
          </button>
        </div>
      </div>
      <Editor draft={draft} onSave={handleSave} onClose={() => router.push('/')} />
    </main>
  );
} 