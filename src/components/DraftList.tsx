'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { getDrafts, deleteDraft } from '@/utils/storage';
import './DraftList.css';

interface Draft {
  id: string;
  title: string;
  content: string;
  lastModified: string;
}

export default function DraftList() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const router = useRouter();

  useEffect(() => {
    const loadDrafts = () => {
      const savedDrafts = getDrafts();
      setDrafts(savedDrafts);
    };

    loadDrafts();
    window.addEventListener('storage', loadDrafts);
    return () => window.removeEventListener('storage', loadDrafts);
  }, []);

  const handleCreateDraft = () => {
    const newDraft = {
      id: Date.now().toString(),
      title: 'Untitled Draft',
      content: '',
      lastModified: new Date().toISOString(),
    };
    const updatedDrafts = [...drafts, newDraft];
    localStorage.setItem('drafts', JSON.stringify(updatedDrafts));
    setDrafts(updatedDrafts);
    router.push(`/editor/${newDraft.id}`);
  };

  const handleDeleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteDraft(id);
    setDrafts(drafts.filter(draft => draft.id !== id));
  };

  return (
    <>
      <div className="action-bar">
        <div className="draft-count">
          {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}
        </div>
        <button onClick={handleCreateDraft} className="new-draft-button">
          <PlusIcon />
          New Draft
        </button>
      </div>

      <div className="draft-list">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="draft-item"
            onClick={() => router.push(`/editor/${draft.id}`)}
          >
            <div className="draft-content">
              <div className="draft-info">
                <div className="draft-title">{draft.title}</div>
                <div className="draft-date">
                  {new Date(draft.lastModified).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteDraft(draft.id, e)}
                className="delete-button"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
} 