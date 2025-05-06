'use client';

import DraftList from '@/components/DraftList';

export default function Home() {
  return (
    <main className="container">
      <div className="header">
        <p>Write your thoughts, save them as drafts, and publish when ready.</p>
      </div>
      <DraftList />
    </main>
  );
}
