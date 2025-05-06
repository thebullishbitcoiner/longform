'use client';

import { BlogDraft } from '@/types/blog';
import { getDrafts, deleteDraft } from '@/utils/storage';
import { useEffect, useState } from 'react';
import DraftList from '@/components/DraftList';

export default function Home() {
  const [drafts, setDrafts] = useState<BlogDraft[]>([]);

  useEffect(() => {
    setDrafts(getDrafts());
  }, []);

  const handleDeleteDraft = (id: string) => {
    deleteDraft(id);
    setDrafts(getDrafts());
  };

  return (
    <main className="container">
      <div className="header">
        <p>Write your thoughts, save them as drafts, and publish when ready.</p>
      </div>
      <DraftList />
    </main>
  );
}
